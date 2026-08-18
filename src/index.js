import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

// Wisp Configuration: Refer to the documentation at https://www.npmjs.com/package/@mercuryworkshop/wisp-js

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
	allow_udp_streams: false,
	hostname_blacklist: [/example\.com/],
	dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
	serverFactory: (handler) => {
		return createServer()
			.on("request", (req, res) => {
				// Only set COOP/COEP on secure or localhost origins to avoid browser warnings on insecure origins
				const hostHeader = req.headers.host || "";
				const isLocal = hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1");
				const isEncrypted = Boolean(req.socket.encrypted);
				if (isEncrypted || isLocal || req.headers["x-forwarded-proto"] === "https") {
					res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
					res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
				}
				handler(req, res);
			})
			.on("upgrade", (req, socket, head) => {
				if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
				else socket.end();
			});
	},
});

// Add JSON body parser
fastify.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
	try {
		const parsed = JSON.parse(body);
		done(null, parsed);
	} catch (error) {
		error.statusCode = 400;
		done(error, undefined);
	}
});

// Add CORS headers
fastify.addHook("onRequest", (request, reply, done) => {
	// CORS for all requests
	reply.header("Access-Control-Allow-Origin", "*");
	reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
	
	// Handle preflight requests
	if (request.method === "OPTIONS") {
		reply.send();
		return;
	}
	done();
});

fastify.register(fastifyStatic, {
	root: publicPath,
	decorateReply: true,
});

fastify.register(fastifyStatic, {
	root: scramjetPath,
	prefix: "/scram/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: libcurlPath,
	prefix: "/libcurl/",
	decorateReply: false,
});

fastify.register(fastifyStatic, {
	root: baremuxPath,
	prefix: "/baremux/",
	decorateReply: false,
});

// Simple server-side proxy to fetch remote HTML and strip frame-blocking headers.
// This helps the client fallback iframe display sites that set X-Frame-Options or CSP frame-ancestors.
fastify.get('/proxy/raw', async (request, reply) => {
	const urlParam = (request.query && request.query.url) || '';
	if (!urlParam) return reply.code(400).send('Missing url parameter');
	let targetUrl;
	try {
		targetUrl = new URL(urlParam);
	} catch (e) {
		return reply.code(400).send('Invalid url');
	}
	if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
		return reply.code(400).send('Invalid protocol');
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15000);
		const res = await fetch(targetUrl.toString(), { signal: controller.signal, redirect: 'follow' });
		clearTimeout(timeout);

		// Clone response headers but remove frame-blocking and CSP headers
		const headers = {};
		res.headers.forEach((v, k) => {
			const kl = k.toLowerCase();
			if (kl === 'x-frame-options' || kl === 'content-security-policy' || kl === 'content-security-policy-report-only' || kl === 'x-content-security-policy') {
				// skip
			} else {
				headers[k] = v;
			}
		});

		const contentType = res.headers.get('content-type') || '';
		let body = await res.arrayBuffer().then(a => Buffer.from(a));

		if (contentType.includes('text/html')) {
			// Insert or replace <base> tag so relative URLs resolve to the original site
			let text = body.toString('utf8');
			const baseTag = `<base href="${targetUrl.origin}">`;
			if (/\<base[^>]*>/i.test(text)) {
				text = text.replace(/\<base[^>]*>/i, baseTag);
			} else if (/\<head[^>]*>/i.test(text)) {
				text = text.replace(/\<head([^>]*)>/i, (m) => `${m}\n    ${baseTag}`);
			} else {
				text = baseTag + '\n' + text;
			}
			body = text;
			// ensure content-type header preserved
			headers['content-type'] = 'text/html; charset=utf-8';
		}

		// Return the body with filtered headers
		Object.entries(headers).forEach(([k,v]) => reply.header(k, v));
		// Prevent caching for proxied content
		reply.header('cache-control', 'no-store');
		return reply.code(res.status).send(body);
	} catch (err) {
		if (err && err.name === 'AbortError') return reply.code(504).send('Upstream fetch timeout');
		return reply.code(502).send('Bad upstream fetch');
	}
});

// --- NODE CONTROL & MONITORING API ---

let nodeStartTime = Date.now();
let activeConnections = 0;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

// Send heartbeat to backend every 30 seconds
async function sendHeartbeat() {
	const uptime = (Date.now() - nodeStartTime) / 1000;
	const memoryUsage = process.memoryUsage();
	const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
	
	try {
		await fetch(`${BACKEND_URL}/api/proxy/heartbeat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				status: 'online',
				uptime_seconds: uptime,
				active_connections: activeConnections,
				memory_usage: memoryMB,
				cpu_usage: process.cpuUsage().user / 1000000
			})
		});
	} catch (error) {
		// Silent fail - don't spam logs
	}
}

// Send heartbeat on startup and every 30 seconds
sendHeartbeat();
setInterval(sendHeartbeat, 30000);

// Track active connections
fastify.addHook("onRequest", (request, reply, done) => {
	activeConnections++;
	done();
});

fastify.addHook("onResponse", (request, reply, done) => {
	activeConnections--;
	done();
});

// Node status endpoint
fastify.get("/api/status", async (request, reply) => {
	const uptime = (Date.now() - nodeStartTime) / 1000; // seconds
	const memoryUsage = process.memoryUsage();
	
	return {
		status: "online",
		uptime: `${(uptime / 86400).toFixed(2)}d`, // days
		uptime_seconds: uptime,
		active_connections: activeConnections,
		memory_usage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100),
		memory_mb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
		cpu_usage: process.cpuUsage().user / 1000000, // seconds
		version: "2.0.0",
		node_version: process.version,
		pid: process.pid,
		platform: process.platform,
		arch: process.arch
	};
});

// Restart endpoint
fastify.post("/api/restart", async (request, reply) => {
	console.log("Restart command received, shutting down...");
	
	// Give time for response to be sent
	setTimeout(() => {
		process.exit(0);
	}, 100);
	
	return { success: true, message: "Restarting..." };
});

// Stop endpoint
fastify.post("/api/stop", async (request, reply) => {
	console.log("Stop command received, shutting down...");
	
	// Give time for response to be sent
	setTimeout(() => {
		process.exit(0);
	}, 100);
	
	return { success: true, message: "Stopping..." };
});

// Proxy route: serves index.html and auto-loads the URL
fastify.get("/proxy/*", (request, reply) => {
	const url = request.params && request.params['*'];
	return reply.sendFile("index.html");
});

fastify.setNotFoundHandler((res, reply) => {
	return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
	const address = fastify.server.address();

	// by default we are listening on 0.0.0.0 (every interface)
	// we just need to list a few
	console.log("Listening on:");
	console.log(`\thttp://localhost:${address.port}`);
	console.log(`\thttp://${hostname()}:${address.port}`);
	console.log(
		`\thttp://${
			address.family === "IPv6" ? `[${address.address}]` : address.address
		}:${address.port}`
	);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	fastify.close();
	process.exit(0);
}

let port = parseInt(process.env.PORT || "");

if (isNaN(port)) port = 3000;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});

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
				res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
				res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
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
	const url = request.params["*"];
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

if (isNaN(port)) port = 8080;

fastify.listen({
	port: port,
	host: "0.0.0.0",
});

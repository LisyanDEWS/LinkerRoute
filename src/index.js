import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import os from "node:os";
import cluster from "node:cluster";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
const numWorkers = os.cpus().length;

// ============================================================================
// CLUSTERING: Run multiple instances on all CPU cores
// ============================================================================
if (cluster.isPrimary) {
	console.log(`🚀 Master process ${process.pid} is running`);
	console.log(`📊 Spawning ${numWorkers} worker processes...`);

	for (let i = 0; i < numWorkers; i++) {
		cluster.fork();
	}

	cluster.on("exit", (worker, code, signal) => {
		console.log(`⚠️  Worker ${worker.process.pid} died`);
		console.log(`🔄 Restarting worker...`);
		cluster.fork();
	});

	// Print cluster info
	console.log(`\n✅ Clustering enabled: ${numWorkers} workers`);
	console.log(`📈 Load distribution: ~${Math.ceil(100 / numWorkers)} users per worker\n`);
} else {
	// ============================================================================
	// WORKER PROCESS: Run actual server
	// ============================================================================
	
	// Wisp Configuration with optimizations
	logging.set_level(logging.NONE);
	Object.assign(wisp.options, {
		allow_udp_streams: false,
		hostname_blacklist: [/example\.com/],
		dns_servers: ["8.8.8.8", "8.8.4.4"], // Google DNS (faster)
		max_connections: 1000, // Increased from default
		socket_timeout: 60000,
	});

	const fastify = Fastify({
		serverFactory: (handler) => {
			return createServer()
				.maxHeadersCount(16384) // Increase from default 2000
				.timeout(120000) // 2 minute timeout
				.on("request", (req, res) => {
					handler(req, res);
				})
				.on("upgrade", (req, socket, head) => {
					if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
					else socket.end();
				});
		},
		bodyLimit: 1048576 * 5, // 5MB instead of 1MB
		requestTimeout: 120000,
	});

	// ============================================================================
	// COMPRESSION: Reduce bandwidth usage
	// ============================================================================
	await fastify.register(fastifyCompress, {
		threshold: 1024, // Compress responses > 1KB
		encodings: ["gzip", "deflate"],
	});

	// ============================================================================
	// SECURITY & HEADERS
	// ============================================================================
	await fastify.register(fastifyHelmet, {
		crossOriginResourcePolicy: false,
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
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
		reply.header("Access-Control-Allow-Origin", "*");
		reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
		reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
		reply.header("Cross-Origin-Opener-Policy", "same-origin");
		reply.header("Cross-Origin-Embedder-Policy", "require-corp");
		reply.header("Cache-Control", "public, max-age=3600"); // Cache static files

		if (request.method === "OPTIONS") {
			reply.send();
			return;
		}
		done();
	});

	// ============================================================================
	// STATIC FILES (CACHED)
	// ============================================================================
	fastify.register(fastifyStatic, {
		root: publicPath,
		decorateReply: true,
		maxAge: "1h", // Cache for 1 hour
	});

	fastify.register(fastifyStatic, {
		root: scramjetPath,
		prefix: "/scram/",
		decorateReply: false,
		maxAge: "1d", // Cache for 1 day
	});

	fastify.register(fastifyStatic, {
		root: libcurlPath,
		prefix: "/libcurl/",
		decorateReply: false,
		maxAge: "1d",
	});

	fastify.register(fastifyStatic, {
		root: baremuxPath,
		prefix: "/baremux/",
		decorateReply: false,
		maxAge: "1d",
	});

	fastify.get("/proxy/*", (request, reply) => {
		return reply.sendFile("index.html");
	});

	fastify.setNotFoundHandler((res, reply) => {
		return reply.sendFile("index.html");
	});

	fastify.server.on("listening", () => {
		const address = fastify.server.address();
		console.log(`✅ Worker ${process.pid} listening on:`);
		console.log(`\thttp://localhost:${address.port}`);
		console.log(`\thttp://${hostname()}:${address.port}`);
	});

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	function shutdown() {
		console.log("SIGTERM signal received: closing HTTP server");
		fastify.close();
		process.exit(0);
	}

	let port = parseInt(process.env.PORT || "3000");
	if (isNaN(port)) port = 3000;

	fastify.listen({
		port: port,
		host: "0.0.0.0",
	});
}

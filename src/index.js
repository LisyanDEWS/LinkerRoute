import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { basename } from "node:path";
import { availableParallelism, cpus, hostname } from "node:os";
import { performance } from "node:perf_hooks";
import process from "node:process";
import cluster from "node:cluster";
import { fileURLToPath } from "node:url";

import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import fastifyCompress from "@fastify/compress";
import fastifyHelmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
const durationBucketBounds = [
	50,
	100,
	250,
	500,
	1000,
	2500,
	5000,
	10000,
	30000,
	Infinity,
];

function parseInteger(
	value,
	fallback,
	minimum = 0,
	maximum = Number.MAX_SAFE_INTEGER
) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(maximum, Math.max(minimum, parsed));
}

function parseBoolean(value, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseBytes(value, fallback) {
	if (value === undefined || value === null || value === "") return fallback;
	const match = String(value)
		.trim()
		.match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)?$/i);
	if (!match) return fallback;

	const units = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
	const bytes = Number(match[1]) * (units[match[2]?.toLowerCase()] || 1);
	return Number.isSafeInteger(bytes) ? bytes : fallback;
}

function parseList(value, fallback = []) {
	if (!value) return fallback;
	return String(value)
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

function detectCpuCount() {
	try {
		return Math.max(1, availableParallelism());
	} catch {
		return Math.max(1, cpus().length);
	}
}

function getWorkerCount(cpuCount) {
	const configured = process.env.WORKERS ?? process.env.WEB_CONCURRENCY;
	const maximum = parseInteger(process.env.MAX_WORKERS, 8, 1, 64);

	if (configured && configured.toLowerCase() !== "auto") {
		return parseInteger(configured, Math.min(cpuCount, maximum), 1, maximum);
	}

	// availableParallelism() is cgroup-aware on supported Node versions. The cap
	// prevents a container from forking once for every host CPU when the runtime
	// does not expose its CPU quota correctly.
	return Math.max(1, Math.min(cpuCount, maximum));
}

function readConfig() {
	const nodeEnv = process.env.NODE_ENV || "development";
	const cpuCount = detectCpuCount();

	return {
		nodeEnv,
		cpuCount,
		workerCount: getWorkerCount(cpuCount),
		port: parseInteger(process.env.PORT, 3000, 1, 65535),
		host: process.env.HOST || "0.0.0.0",
		trustProxy: parseBoolean(process.env.TRUST_PROXY, false),
		bodyLimit: parseBytes(process.env.MAX_BODY_SIZE, 1024 * 1024),
		maxHeaderSize: parseBytes(process.env.MAX_HEADER_SIZE, 16 * 1024),
		maxHeadersCount: parseInteger(process.env.MAX_HEADERS_COUNT, 100, 1, 1000),
		maxConnections: parseInteger(
			process.env.MAX_CONNECTIONS,
			1000,
			0,
			1_000_000
		),
		maxConnectionsPerIp: parseInteger(
			process.env.MAX_CONNECTIONS_PER_IP,
			100,
			0,
			100_000
		),
		maxRequestsPerSocket: parseInteger(
			process.env.MAX_REQUESTS_PER_SOCKET,
			1000,
			0,
			1_000_000
		),
		rateLimitMax: parseInteger(process.env.RATE_LIMIT_MAX, 300, 0, 1_000_000),
		rateLimitWindowMs: parseInteger(
			process.env.RATE_LIMIT_WINDOW_MS,
			60_000,
			1000,
			86_400_000
		),
		requestTimeout: parseInteger(
			process.env.REQUEST_TIMEOUT_MS,
			120_000,
			0,
			86_400_000
		),
		headersTimeout: parseInteger(
			process.env.HEADERS_TIMEOUT_MS,
			30_000,
			1000,
			86_400_000
		),
		keepAliveTimeout: parseInteger(
			process.env.KEEP_ALIVE_TIMEOUT_MS,
			10_000,
			1000,
			86_400_000
		),
		socketTimeout: parseInteger(
			process.env.SOCKET_TIMEOUT_MS,
			0,
			0,
			86_400_000
		),
		shutdownTimeout: parseInteger(
			process.env.SHUTDOWN_TIMEOUT_MS,
			25_000,
			1000,
			300_000
		),
		enableCompression: parseBoolean(process.env.ENABLE_COMPRESSION, true),
		logRequests: parseBoolean(process.env.LOG_REQUESTS, false),
		metricsToken: process.env.METRICS_TOKEN?.trim() || "",
		corsOrigins: parseList(process.env.CORS_ORIGINS),
		wispDnsServers: parseList(process.env.WISP_DNS_SERVERS, [
			"1.1.1.1",
			"8.8.8.8",
		]),
		wispDnsMethod:
			process.env.WISP_DNS_METHOD === "lookup" ? "lookup" : "resolve",
		wispStreamLimitTotal: parseInteger(
			process.env.WISP_STREAM_LIMIT_TOTAL ?? process.env.WISP_MAX_CONNECTIONS,
			100,
			1,
			1_000_000
		),
		wispStreamLimitPerHost: parseInteger(
			process.env.WISP_STREAM_LIMIT_PER_HOST,
			50,
			1,
			100_000
		),
	};
}

class FixedWindowRateLimiter {
	constructor(maxRequests, windowMs, maxKeys = 10_000) {
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
		this.maxKeys = maxKeys;
		this.buckets = new Map();
	}

	consume(key) {
		if (this.maxRequests <= 0) {
			return { allowed: true, remaining: 0, retryAfter: 0 };
		}

		const now = Date.now();
		let bucket = this.buckets.get(key);
		if (!bucket || now >= bucket.resetAt) {
			if (!bucket && this.buckets.size >= this.maxKeys) this.evictOldest();
			bucket = { count: 0, resetAt: now + this.windowMs };
			this.buckets.set(key, bucket);
		}

		if (bucket.count >= this.maxRequests) {
			return {
				allowed: false,
				remaining: 0,
				retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
			};
		}

		bucket.count += 1;
		return {
			allowed: true,
			remaining: this.maxRequests - bucket.count,
			retryAfter: 0,
		};
	}

	cleanup() {
		const now = Date.now();
		for (const [key, bucket] of this.buckets) {
			if (now >= bucket.resetAt) this.buckets.delete(key);
		}
	}

	evictOldest() {
		let oldestKey;
		let oldestReset = Number.POSITIVE_INFINITY;
		for (const [key, bucket] of this.buckets) {
			if (bucket.resetAt < oldestReset) {
				oldestKey = key;
				oldestReset = bucket.resetAt;
			}
		}
		if (oldestKey !== undefined) this.buckets.delete(oldestKey);
	}
}

function getClientIp(headers, socket, trustProxy) {
	const remoteAddress = socket?.remoteAddress || "unknown";
	if (!trustProxy) return remoteAddress.replace(/^::ffff:/, "");

	const forwarded = headers?.["x-forwarded-for"];
	const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
	const firstForwarded = String(forwardedValue || "")
		.split(",")[0]
		.trim();
	const address = firstForwarded || headers?.["x-real-ip"] || remoteAddress;
	return String(address).replace(/^::ffff:/, "");
}

function getPath(url = "/") {
	return url.split("?", 1)[0] || "/";
}

function isWispUpgrade(request) {
	try {
		return (
			new URL(request.url || "/", "http://localhost").pathname === "/wisp/"
		);
	} catch {
		return false;
	}
}

function rejectUpgrade(socket, statusCode, message) {
	if (socket.destroyed) return;
	const statusMessages = {
		400: "Bad Request",
		404: "Not Found",
		429: "Too Many Requests",
		503: "Service Unavailable",
	};
	const statusMessage = statusMessages[statusCode] || "Bad Request";
	const body = `${message}\n`;
	socket.end(
		`HTTP/1.1 ${statusCode} ${statusMessage}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
	);
}

function tokensMatch(expected, received) {
	if (!expected || !received) return false;
	const expectedBuffer = Buffer.from(expected);
	const receivedBuffer = Buffer.from(received);
	return (
		expectedBuffer.length === receivedBuffer.length &&
		timingSafeEqual(expectedBuffer, receivedBuffer)
	);
}

function createRequestMetrics() {
	return {
		total: 0,
		clientErrors: 0,
		serverErrors: 0,
		durationSum: 0,
		durationBuckets: new Array(durationBucketBounds.length).fill(0),
		startedAt: process.cpuUsage(),
	};
}

function recordRequest(metrics, statusCode, durationMs) {
	metrics.total += 1;
	if (statusCode >= 400 && statusCode < 500) metrics.clientErrors += 1;
	if (statusCode >= 500) metrics.serverErrors += 1;
	metrics.durationSum += durationMs / 1000;

	const bucketIndex = durationBucketBounds.findIndex(
		(limit) => durationMs <= limit
	);
	metrics.durationBuckets[
		bucketIndex === -1 ? metrics.durationBuckets.length - 1 : bucketIndex
	] += 1;
}

function renderMetrics(metrics, activeSockets, config) {
	const memory = process.memoryUsage();
	const cpu = process.cpuUsage(metrics.startedAt);
	const lines = [
		"# HELP linkerroute_http_requests_total Total HTTP requests handled by this worker.",
		"# TYPE linkerroute_http_requests_total counter",
		`linkerroute_http_requests_total ${metrics.total}`,
		"# HELP linkerroute_http_client_errors_total HTTP 4xx responses.",
		"# TYPE linkerroute_http_client_errors_total counter",
		`linkerroute_http_client_errors_total ${metrics.clientErrors}`,
		"# HELP linkerroute_http_server_errors_total HTTP 5xx responses.",
		"# TYPE linkerroute_http_server_errors_total counter",
		`linkerroute_http_server_errors_total ${metrics.serverErrors}`,
		"# HELP linkerroute_http_request_duration_seconds HTTP request duration histogram.",
		"# TYPE linkerroute_http_request_duration_seconds histogram",
	];

	let cumulative = 0;
	for (let index = 0; index < durationBucketBounds.length; index += 1) {
		cumulative += metrics.durationBuckets[index];
		const label =
			durationBucketBounds[index] === Infinity
				? "+Inf"
				: durationBucketBounds[index] / 1000;
		lines.push(
			`linkerroute_http_request_duration_seconds_bucket{le="${label}"} ${cumulative}`
		);
	}
	lines.push(
		`linkerroute_http_request_duration_seconds_sum ${metrics.durationSum}`
	);
	lines.push(
		`linkerroute_http_request_duration_seconds_count ${metrics.total}`
	);
	lines.push(
		"# HELP linkerroute_active_sockets Current TCP connections held by this worker."
	);
	lines.push("# TYPE linkerroute_active_sockets gauge");
	lines.push(`linkerroute_active_sockets ${activeSockets.size}`);
	lines.push(
		"# HELP process_resident_memory_bytes Resident memory used by this worker."
	);
	lines.push("# TYPE process_resident_memory_bytes gauge");
	lines.push(`process_resident_memory_bytes ${memory.rss}`);
	lines.push("# HELP nodejs_heap_size_used_bytes V8 heap currently in use.");
	lines.push("# TYPE nodejs_heap_size_used_bytes gauge");
	lines.push(`nodejs_heap_size_used_bytes ${memory.heapUsed}`);
	lines.push("# HELP process_cpu_seconds_total CPU time used by this worker.");
	lines.push("# TYPE process_cpu_seconds_total counter");
	lines.push(
		`process_cpu_seconds_total ${(cpu.user + cpu.system) / 1_000_000}`
	);
	lines.push("# HELP process_uptime_seconds Worker uptime in seconds.");
	lines.push("# TYPE process_uptime_seconds gauge");
	lines.push(`process_uptime_seconds ${process.uptime()}`);
	lines.push(
		"# HELP linkerroute_worker_info Information about the current worker."
	);
	lines.push("# TYPE linkerroute_worker_info gauge");
	lines.push(
		`linkerroute_worker_info{pid="${process.pid}",worker_id="${cluster.worker?.id || 0}",configured_workers="${config.workerCount}"} 1`
	);
	return `${lines.join("\n")}\n`;
}

function startPrimary(config) {
	cluster.schedulingPolicy = cluster.SCHED_RR;
	let stopping = false;

	console.log(
		`Starting LinkerRoute with ${config.workerCount} worker(s) (${config.cpuCount} available CPU(s))`
	);
	console.log(
		`Environment: ${config.nodeEnv}; listening on ${config.host}:${config.port}`
	);

	const spawnWorker = () => {
		if (!stopping) cluster.fork();
	};

	for (let index = 0; index < config.workerCount; index += 1) spawnWorker();

	cluster.on("online", (worker) => {
		console.log(`Worker ${worker.id} (${worker.process.pid}) is online`);
	});

	cluster.on("exit", (worker, code, signal) => {
		if (stopping) return;
		console.error(
			`Worker ${worker.id} (${worker.process.pid}) exited (${signal || `code ${code}`}); restarting`
		);
		setTimeout(spawnWorker, 1000);
	});

	const shutdown = (signal) => {
		if (stopping) return;
		stopping = true;
		console.log(`${signal} received; stopping workers`);
		for (const worker of Object.values(cluster.workers)) {
			worker?.process.kill("SIGTERM");
		}
		setTimeout(() => process.exit(0), config.shutdownTimeout).unref();
	};

	process.on("SIGINT", () => shutdown("SIGINT"));
	process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function startWorker(config) {
	logging.set_level(logging.NONE);
	Object.assign(wisp.options, {
		allow_udp_streams: false,
		dns_method: config.wispDnsMethod,
		dns_servers: config.wispDnsServers,
		stream_limit_total: config.wispStreamLimitTotal,
		stream_limit_per_host: config.wispStreamLimitPerHost,
	});

	const activeSockets = new Set();
	const ipSockets = new Map();
	const socketIps = new WeakMap();
	const rateLimiter = new FixedWindowRateLimiter(
		config.rateLimitMax,
		config.rateLimitWindowMs
	);
	const requestMetrics = createRequestMetrics();
	const rateLimitCleanup = setInterval(
		() => rateLimiter.cleanup(),
		config.rateLimitWindowMs
	);
	rateLimitCleanup.unref();
	let ready = false;
	let stopping = false;

	const registerIpSocket = (socket, ip) => {
		if (socketIps.has(socket)) return true;
		if (config.maxConnectionsPerIp > 0) {
			const current = ipSockets.get(ip) || 0;
			if (current >= config.maxConnectionsPerIp) return false;
			ipSockets.set(ip, current + 1);
		}
		socketIps.set(socket, ip);
		socket.once("close", () => {
			const registeredIp = socketIps.get(socket);
			if (registeredIp && config.maxConnectionsPerIp > 0) {
				const current = ipSockets.get(registeredIp) || 0;
				if (current <= 1) ipSockets.delete(registeredIp);
				else ipSockets.set(registeredIp, current - 1);
			}
		});
		return true;
	};

	let httpServer;
	const fastify = Fastify({
		bodyLimit: config.bodyLimit,
		trustProxy: config.trustProxy,
		logger: config.logRequests
			? { level: process.env.LOG_LEVEL || "info" }
			: false,
		serverFactory: (handler) => {
			const server = createServer(
				{ maxHeaderSize: config.maxHeaderSize },
				handler
			);
			server.maxHeadersCount = config.maxHeadersCount;
			server.keepAliveTimeout = config.keepAliveTimeout;
			server.headersTimeout = Math.max(
				config.headersTimeout,
				config.keepAliveTimeout + 1000
			);
			server.requestTimeout = config.requestTimeout;
			if (config.maxRequestsPerSocket > 0) {
				server.maxRequestsPerSocket = config.maxRequestsPerSocket;
			}
			if (config.maxConnections > 0)
				server.maxConnections = config.maxConnections;
			if (config.socketTimeout > 0) server.timeout = config.socketTimeout;

			server.on("connection", (socket) => {
				activeSockets.add(socket);
				socket.once("close", () => activeSockets.delete(socket));
			});
			server.on("clientError", (_error, socket) => {
				if (!socket.destroyed) rejectUpgrade(socket, 400, "Bad request");
			});
			server.on("upgrade", (request, socket, head) => {
				const ip = getClientIp(request.headers, socket, config.trustProxy);
				if (!isWispUpgrade(request)) {
					rejectUpgrade(socket, 404, "WebSocket endpoint not found");
					return;
				}
				if (!ready || request.headers.upgrade?.toLowerCase() !== "websocket") {
					rejectUpgrade(
						socket,
						ready ? 400 : 503,
						"WebSocket service is not ready"
					);
					return;
				}

				const rate = rateLimiter.consume(ip);
				if (!rate.allowed) {
					rejectUpgrade(socket, 429, "Rate limit exceeded");
					return;
				}
				if (!registerIpSocket(socket, ip)) {
					rejectUpgrade(socket, 429, "Too many connections from this IP");
					return;
				}

				try {
					wisp.routeRequest(request, socket, head);
				} catch (error) {
					console.error(`Wisp upgrade failed in worker ${process.pid}:`, error);
					socket.destroy();
				}
			});
			httpServer = server;
			return server;
		},
	});

	await fastify.register(fastifyHelmet, {
		contentSecurityPolicy: false,
		crossOriginEmbedderPolicy: false,
		crossOriginResourcePolicy: false,
		hsts: config.nodeEnv === "production",
	});

	if (config.enableCompression) {
		await fastify.register(fastifyCompress, {
			global: true,
			threshold: 1024,
			encodings: ["br", "gzip"],
		});
	}

	fastify.addHook("onRequest", async (request, reply) => {
		request.linkerrouteStartedAt = performance.now();
		const path = getPath(request.url);
		const ip = getClientIp(
			request.headers,
			request.raw.socket,
			config.trustProxy
		);

		// The browser and Railway probe both need these endpoints even when the
		// application is under load. They do not consume the public rate limit.
		const isProbe = path === "/health" || path === "/ready";
		if (!isProbe && !registerIpSocket(request.raw.socket, ip)) {
			reply
				.code(429)
				.header("Retry-After", "60")
				.send({ error: "Too many connections from this IP" });
			return;
		}

		if (!isProbe) {
			const rate = rateLimiter.consume(ip);
			reply.header("X-RateLimit-Limit", config.rateLimitMax);
			reply.header("X-RateLimit-Remaining", rate.remaining);
			if (!rate.allowed) {
				reply.header("Retry-After", rate.retryAfter);
				reply.code(429).send({ error: "Rate limit exceeded" });
				return;
			}
		}

		reply.header("X-Request-ID", request.id);
		reply.header("Cross-Origin-Opener-Policy", "same-origin");
		reply.header("Cross-Origin-Embedder-Policy", "require-corp");
		reply.header("Cross-Origin-Resource-Policy", "cross-origin");

		const origin = request.headers.origin;
		const isWildcardCors = config.corsOrigins.includes("*");
		const isAllowedCors =
			isWildcardCors || (origin && config.corsOrigins.includes(origin));
		if (origin && isAllowedCors) {
			reply.header(
				"Access-Control-Allow-Origin",
				isWildcardCors ? "*" : origin
			);
			reply.header("Vary", "Origin");
			reply.header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
			reply.header(
				"Access-Control-Allow-Headers",
				"Content-Type, Authorization"
			);
		}

		if (request.method === "OPTIONS") {
			reply.code(204).send();
			return;
		}
	});

	fastify.addHook("onResponse", async (request, reply) => {
		if (request.linkerrouteStartedAt !== undefined) {
			recordRequest(
				requestMetrics,
				reply.statusCode,
				performance.now() - request.linkerrouteStartedAt
			);
		}
	});

	fastify.get("/health", async (_request, reply) => {
		reply.header("Cache-Control", "no-store");
		return {
			status: "ok",
			service: "linkerroute",
			pid: process.pid,
			uptime: Math.floor(process.uptime()),
		};
	});

	fastify.get("/ready", async (_request, reply) => {
		reply.header("Cache-Control", "no-store");
		if (!ready) return reply.code(503).send({ status: "starting" });
		return { status: "ready" };
	});

	fastify.get("/metrics", async (request, reply) => {
		if (!config.metricsToken)
			return reply.code(404).send({ error: "Not found" });
		const suppliedToken =
			request.headers["x-metrics-token"] ||
			request.headers.authorization?.replace(/^Bearer\s+/i, "");
		if (!tokensMatch(config.metricsToken, suppliedToken)) {
			return reply.code(401).send({ error: "Unauthorized" });
		}
		reply.type("text/plain; version=0.0.4; charset=utf-8");
		return renderMetrics(requestMetrics, activeSockets, config);
	});

	fastify.setErrorHandler((error, request, reply) => {
		const statusCode =
			error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
		if (statusCode >= 500) {
			console.error(
				`Request ${request.id} failed in worker ${process.pid}:`,
				error.message
			);
		}
		const message =
			statusCode === 413
				? "Request body is too large"
				: statusCode === 408
					? "Request timed out"
					: statusCode >= 500
						? "Internal server error"
						: "Bad request";
		reply.code(statusCode).send({ error: message });
	});

	await fastify.register(fastifyStatic, {
		root: publicPath,
		decorateReply: true,
		maxAge: "1h",
		setHeaders: (reply, filePath) => {
			const fileName = basename(filePath);
			if (
				["index.html", "config.js", "register-sw.js", "sw.js"].includes(
					fileName
				)
			) {
				reply.header("Cache-Control", "no-cache, must-revalidate");
			} else {
				reply.header("Cache-Control", "public, max-age=3600");
			}
		},
	});

	const immutableStaticOptions = (root, prefix) => ({
		root,
		prefix,
		decorateReply: false,
		maxAge: "1y",
		setHeaders: (reply) => {
			reply.header("Cache-Control", "public, max-age=31536000, immutable");
		},
	});

	await fastify.register(
		fastifyStatic,
		immutableStaticOptions(scramjetPath, "/scram/")
	);
	await fastify.register(
		fastifyStatic,
		immutableStaticOptions(libcurlPath, "/libcurl/")
	);
	await fastify.register(
		fastifyStatic,
		immutableStaticOptions(baremuxPath, "/baremux/")
	);

	fastify.get("/proxy/*", async (_request, reply) => {
		reply.header("Cache-Control", "no-store");
		return reply.sendFile("index.html");
	});

	fastify.setNotFoundHandler((request, reply) => {
		if (request.method !== "GET" && request.method !== "HEAD") {
			return reply.code(404).send({ error: "Not found" });
		}
		reply.header("Cache-Control", "no-store");
		return reply.sendFile("index.html");
	});

	const shutdown = async (signal) => {
		if (stopping) return;
		stopping = true;
		ready = false;
		clearInterval(rateLimitCleanup);
		console.log(
			`Worker ${process.pid} received ${signal}; draining connections`
		);

		let timeout;
		try {
			const closePromise = fastify.close().catch((error) => {
				console.error(
					`Worker ${process.pid} failed to close cleanly:`,
					error.message
				);
			});
			const timeoutPromise = new Promise((resolve) => {
				timeout = setTimeout(resolve, config.shutdownTimeout);
			});
			await Promise.race([closePromise, timeoutPromise]);
		} finally {
			if (timeout) clearTimeout(timeout);
			httpServer?.closeIdleConnections?.();
			for (const socket of activeSockets) socket.destroy();
			process.exit(0);
		}
	};

	process.on("SIGINT", () => void shutdown("SIGINT"));
	process.on("SIGTERM", () => void shutdown("SIGTERM"));
	process.on("uncaughtException", (error) => {
		console.error(`Uncaught exception in worker ${process.pid}:`, error);
		void shutdown("uncaughtException");
	});
	process.on("unhandledRejection", (error) => {
		console.error(`Unhandled rejection in worker ${process.pid}:`, error);
		void shutdown("unhandledRejection");
	});

	try {
		await fastify.listen({ port: config.port, host: config.host });
		ready = true;
		console.log(
			`Worker ${process.pid} listening on http://${hostname()}:${config.port} (HTTP keep-alive ${config.keepAliveTimeout}ms)`
		);
	} catch (error) {
		console.error(`Worker ${process.pid} failed to start:`, error);
		process.exit(1);
	}
}

const config = readConfig();
if (cluster.isPrimary) {
	startPrimary(config);
} else {
	await startWorker(config);
}

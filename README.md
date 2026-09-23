# LinkerRoute

Production-ready Telegram Web proxy based on Scramjet, BareMux and Wisp.
The application is designed to run as a stateless container on Railway or behind
Nginx/Caddy on a regular VPS.

## Local start

Requirements: Node.js 20.18+ and npm 10+.

```bash
npm ci
cp .env.example .env       # optional
npm start
```

Without a `PORT` variable the local server listens on `http://localhost:3000`.
For a low-memory development machine use `WORKERS=1 npm start`. The source is
also checked with:

```bash
npm run check
```

## Deploy to Railway

The repository includes `railway.json` and a production Dockerfile, so no custom
start command is required.

1. Create a new Railway project and deploy this repository from GitHub.
2. Railway builds `Dockerfile` and injects the public `PORT` automatically.
3. Add the production variables below in **Variables**. Do not hard-code the
   Railway `PORT`; the application binds to `0.0.0.0:$PORT`.
4. Wait for the `/health` deployment check to pass, then generate a Railway
   domain or attach a custom domain.
5. If Cloudflare is used, enable proxying and WebSockets for the domain. Put the
   WAF/rate limit rules in front of the Railway service as well as keeping the
   application limits enabled.

Railway's managed ingress is the reverse proxy in this deployment: it terminates
TLS, exposes the service publicly, supports WebSocket upgrades, and handles the
external connection. Do **not** add Nginx as a second process in the Railway
service. `deploy/nginx.conf` and `docker-compose.yml` are provided for a
self-hosted VPS only.

### Recommended Railway variables

Railway's CPU and memory limits determine the correct values. `WORKERS=auto`
uses the container CPU quota and caps the number of Node workers at eight.
Every worker has its own memory, connection and in-memory rate-limit budget.

```text
NODE_ENV=production
WORKERS=auto
MAX_WORKERS=8
NODE_OPTIONS=--max-old-space-size=512
TRUST_PROXY=true
LOG_REQUESTS=false
ENABLE_COMPRESSION=true
MAX_CONNECTIONS=1000
MAX_CONNECTIONS_PER_IP=100
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW_MS=60000
MAX_BODY_SIZE=1mb
METRICS_TOKEN=<long-random-secret>
```

`NODE_OPTIONS` is a **per-worker** V8 heap limit. Increase it only together
with the Railway memory plan. A practical starting point is 512 MB per worker;
with four workers reserve memory for four heaps plus native buffers and sockets.
On a one-vCPU plan set `WORKERS=1`. When scaling Railway replicas, prefer
`WORKERS=1` per replica and let Railway distribute traffic horizontally instead
of oversubscribing one container.

### Runtime configuration

| Variable                      |                  Default | Purpose                                                     |
| ----------------------------- | -----------------------: | ----------------------------------------------------------- |
| `PORT`                        | Railway / `3000` locally | HTTP port; supplied by Railway                              |
| `WORKERS` / `WEB_CONCURRENCY` |                   `auto` | Number of cluster workers; explicit value wins              |
| `MAX_WORKERS`                 |                      `8` | Safety cap for automatic worker detection                   |
| `NODE_OPTIONS`                |     Docker: 1024 MB heap | V8 memory ceiling per process                               |
| `TRUST_PROXY`                 |                  `false` | Use Railway/Nginx `X-Forwarded-For` for client IPs          |
| `MAX_CONNECTIONS`             |                   `1000` | Maximum TCP connections per worker                          |
| `MAX_CONNECTIONS_PER_IP`      |                    `100` | Per-IP socket limit per worker; `0` disables it             |
| `RATE_LIMIT_MAX`              |                    `300` | Requests per `RATE_LIMIT_WINDOW_MS` per IP; `0` disables it |
| `MAX_BODY_SIZE`               |                    `1mb` | Maximum request body                                        |
| `MAX_HEADER_SIZE`             |                   `16kb` | Maximum HTTP header block                                   |
| `MAX_HEADERS_COUNT`           |                    `100` | Maximum incoming header count                               |
| `HEADERS_TIMEOUT_MS`          |                  `30000` | Slowloris protection                                        |
| `REQUEST_TIMEOUT_MS`          |                 `120000` | Maximum HTTP request time                                   |
| `KEEP_ALIVE_TIMEOUT_MS`       |                  `10000` | HTTP connection reuse window                                |
| `SOCKET_TIMEOUT_MS`           |                      `0` | General socket timeout; leave `0` for idle WebSockets       |
| `WISP_STREAM_LIMIT_TOTAL`     |                    `100` | Maximum Wisp streams per WebSocket connection               |
| `WISP_STREAM_LIMIT_PER_HOST`  |                     `50` | Maximum Wisp streams to one host per WebSocket              |
| `WISP_DNS_METHOD`             |                `resolve` | Use configured DNS servers (`lookup` uses system DNS)       |
| `WISP_DNS_SERVERS`            |        `1.1.1.1,8.8.8.8` | Resolver list used by Wisp                                  |
| `METRICS_TOKEN`               |                    empty | Enables authenticated Prometheus `/metrics`                 |
| `CORS_ORIGINS`                |                    empty | Optional comma-separated allowed origins                    |

The in-memory rate limiter is intentionally lightweight and local to a worker.
It is not a replacement for a distributed limiter or WAF. For a public service,
also configure Railway/Cloudflare edge rules, bot protection and an external
uptime check.

## Production features included

- **Cluster / worker pool:** workers are based on cgroup-aware CPU count,
  capped at eight and configurable with `WORKERS`; crashed workers are replaced.
- **Platform process supervision:** Railway restarts failed containers and the
  Docker image has a health check. The app drains HTTP/WebSocket sockets on
  `SIGTERM`; PM2 is not needed inside a Railway container.
- **Reverse proxy compatibility:** binds to `0.0.0.0:$PORT`, trusts the Railway
  ingress when configured, and supports WebSocket upgrades at `/wisp/`.
- **Compression:** Brotli and gzip are enabled for responses larger than 1 KiB.
- **Static caching:** the app shell and service worker revalidate; pinned
  Scramjet, libcurl and BareMux assets use one-year immutable cache headers.
- **Connection and request limits:** header/body limits, keep-alive and header
  timeouts, per-IP concurrency, global connection caps and an in-process rate
  limiter are enabled by default.
- **Security headers:** Helmet, HSTS in production, request IDs, no public
  stack traces, optional restricted CORS and authenticated metrics.
- **Health/readiness:** `GET /health` is a lightweight liveness endpoint;
  `GET /ready` returns 503 while a worker is starting.
- **Metrics:** set `METRICS_TOKEN` to expose per-worker Prometheus counters,
  duration buckets, memory, CPU time and active sockets at `/metrics`.
- **Graceful failure:** workers restart after a crash, and uncaught exceptions
  trigger a controlled worker shutdown so the cluster can replace the process.
- **Non-root image and bounded runtime:** Docker uses a multi-stage Node 22
  Alpine image, drops build tools from the runtime image, runs as `node`, and
  sets a default V8 heap ceiling.

## Self-hosted Nginx setup

Railway does not need this section. For a VPS, the included Compose file starts
Node behind Nginx:

```bash
docker compose up -d --build
curl http://localhost/health
```

Put TLS termination, HTTP/2/3, certificates, CDN/WAF and any provider-specific
DDoS controls in front of this Nginx instance. The example config enables gzip,
request/connection limits, upstream keep-alive and the required WebSocket
upgrade headers. Add HTTPS certificates before exposing it to the Internet.

## Operations checklist

- Use a Railway plan with enough RAM for all workers, native buffers and active
  sockets; 4 vCPU / 8 GB is a reasonable starting point for a busy service.
- Keep `LOG_REQUESTS=false` in production and send only startup/error logs to a
  log sink. Do not enable verbose Wisp logs on a public instance.
- Monitor CPU, RSS/heap, network, active sockets, worker restarts, 4xx/5xx and
  request-duration buckets. Alert on sustained memory growth and latency.
- Keep Node, Fastify, Wisp, Scramjet and the lockfile updated; run `npm audit`
  and `npm run check` before deployment.
- Back up Railway variables, `railway.json`, the Dockerfile and any DNS/WAF
  configuration. The proxy is stateless and does not require a persistent
  volume, so a second Railway replica or a new service can be brought up
  quickly.
- Treat this as a public proxy: publish an abuse policy, keep edge protection
  enabled, and tighten `MAX_CONNECTIONS_PER_IP` / `RATE_LIMIT_MAX` if abuse is
  observed.

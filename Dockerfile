# Install dependencies in a throw-away builder so compilers do not end up in the runtime image.
FROM node:22-alpine AS dependencies

WORKDIR /app
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Keep the runtime image small and run it without root privileges.
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
	PORT=8080 \
	WORKERS=auto \
	MAX_WORKERS=8 \
	NODE_OPTIONS=--max-old-space-size=1024

WORKDIR /app
RUN apk add --no-cache libstdc++ wget

COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD-SHELL wget -q -O /dev/null "http://127.0.0.1:${PORT:-8080}/health" || exit 1

STOPSIGNAL SIGTERM
CMD ["node", "src/index.js"]

# syntax=docker/dockerfile:1.7
# One image, two entrypoints: API (default) and worker (`bun apps/api/src/worker.ts`).
# Build from the repository root:  docker build -f apps/api/Dockerfile -t affiliate-api .

ARG BUN_VERSION=1.2.23

FROM oven/bun:${BUN_VERSION}-debian AS deps
WORKDIR /app
# Prisma's query engine needs OpenSSL
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY prisma ./prisma
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN bunx prisma generate \
 && cd apps/api && bunx tsc -p tsconfig.json \
 && bun test test/unit

FROM oven/bun:${BUN_VERSION}-debian AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/prisma ./prisma
COPY --from=build --chown=bun:bun /app/packages/shared ./packages/shared
COPY --from=build --chown=bun:bun /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=bun:bun /app/apps/api/src ./apps/api/src
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD curl -fsS http://localhost:3000/health || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bun", "apps/api/src/index.ts"]

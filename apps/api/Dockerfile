# syntax=docker/dockerfile:1
FROM oven/bun:1.2.23-debian AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN bunx prisma generate

FROM oven/bun:1.2.23-debian AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
USER bun
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "bunx prisma migrate deploy && bun run src/index.ts"]

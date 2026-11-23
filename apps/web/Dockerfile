# syntax=docker/dockerfile:1
FROM oven/bun:1.2.23-debian AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3001 HOST=0.0.0.0
COPY --from=build /app/apps/web/build ./build
COPY --from=build /app/apps/web/package.json ./package.json
USER node
EXPOSE 3001
CMD ["node", "build"]

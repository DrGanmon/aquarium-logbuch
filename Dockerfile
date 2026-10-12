# The build and production runtime both use Bun; no Node helper is required.
FROM oven/bun:1.4.3-slim AS build
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bun run dist:bun

FROM oven/bun:1.4.3-slim AS production
WORKDIR /app
COPY package.json bun.lock .npmrc ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/server.js /app/config.js /app/oidc.js /app/LICENSE ./
COPY --from=build /app/src ./src
COPY --from=build /app/public ./public
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown bun:bun /data
VOLUME /data
EXPOSE 3000
USER bun
CMD ["bun", "server.js"]

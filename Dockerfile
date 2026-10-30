# syntax=docker/dockerfile:1
FROM oven/bun:1.4.4 AS manifests
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

FROM manifests AS dependencies
RUN bun install --frozen-lockfile --ignore-scripts

FROM dependencies AS tools
COPY . .
# Kysely needs no code generation, database connection or engine download.
RUN bun run build:api

# The tools target retains the committed SQL assets and Bun migration/seed
# entrypoints for startup and optional in-container tests (no host Bun).
CMD ["bun", "run", "db:migrate"]

FROM manifests AS production-dependencies
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.4.4 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=production-dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=bun:bun /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=tools --chown=bun:bun /app/apps/api/dist ./apps/api/dist
USER bun
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["bun", "apps/api/dist/index.js"]

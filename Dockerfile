# syntax=docker/dockerfile:1
#
# The whole service in one image: the Next.js site, which also polls SIIAU every minute and
# sends the messages (see apps/web/src/instrumentation.ts). Built on the server itself by
# `docker compose up -d --build` (see docs/deploy.md), so it matches the machine's CPU (an
# ARM VM gets ARM binaries of libSQL).

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@10.28.0
WORKDIR /repo
# Dependencies first, so code changes reuse this layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/notify/package.json packages/notify/
COPY packages/siiau/package.json packages/siiau/
COPY tools/fake-siiau/package.json tools/fake-siiau/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @haycupo/web build

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations
WORKDIR /app
# `output: "standalone"`: server.js plus only the files it needs.
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
# Applied when the server starts, before it takes requests.
COPY --from=build --chown=node:node /repo/packages/db/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/web/server.js"]

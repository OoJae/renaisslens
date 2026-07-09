# RenaissLens — full-monorepo image.
# Everything path-resolves via repoRoot() walking up to pnpm-workspace.yaml,
# so the whole workspace ships; there is no Next standalone build here.

# ── build stage ────────────────────────────────────────────────────────────
FROM node:26-bookworm-slim AS build
WORKDIR /app

# toolchain for better-sqlite3's node-gyp fallback when no prebuilt binary matches
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Node 26 ships without corepack — install the pinned pnpm directly
RUN npm i -g pnpm@11.1.2

# manifests first so the dependency layer caches across source-only changes
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/ev-engine/package.json packages/ev-engine/
COPY packages/scraper/package.json packages/scraper/
# dev deps included on purpose: tsx and next are how the app runs
RUN pnpm install --frozen-lockfile

COPY . .
# root build = db:migrate && scrape:mock && next build (needs a populated db
# for static analysis); the db it creates is throwaway — the volume owns state
RUN pnpm build && rm -f data/*.db data/*.db-*

# ── runtime stage ──────────────────────────────────────────────────────────
FROM node:26-bookworm-slim
WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    NEXT_TELEMETRY_DISABLED=1

RUN npm i -g pnpm@11.1.2 \
  && apt-get update && apt-get install -y --no-install-recommends tini curl \
  && rm -rf /var/lib/apt/lists/*

# COPY resolves pnpm's hardlinks into real files and leaves the store + compilers behind
COPY --from=build /app /app

# chromium for the sales-feed DOM fallback (scraper survives a markup change mid-judging)
RUN pnpm --filter @renaisslens/scraper exec playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

# demo-snapshot seed bake: a Railway volume mounted at /app/data SHADOWS the
# committed demo snapshots, so the entrypoint restores them from this copy
RUN cp -a data/snapshots/demo /app/data-seed

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
# tini as PID 1: reaps chromium orphans, forwards SIGTERM to the entrypoint's exec'd next
ENTRYPOINT ["tini", "--"]
CMD ["/entrypoint.sh"]

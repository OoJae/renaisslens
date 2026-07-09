#!/usr/bin/env bash
# RenaissLens container boot: seed volume → migrate → mock-load → watch loop → web.
set -euo pipefail
cd /app

# ── 1. seed a fresh volume ─────────────────────────────────────────────────
# A volume mounted at /app/data shadows the image's committed demo snapshots.
# On first boot (or a wiped volume) restore them from the image bake so the
# dashboard is populated before the first live scrape ever runs.
if [[ ! -f data/snapshots/demo/manifest.json ]]; then
  echo "entrypoint: seeding volume with demo snapshots from image bake"
  mkdir -p data/snapshots
  rm -rf data/snapshots/demo
  cp -a /app/data-seed data/snapshots/demo
fi

# ── 2. schema + baseline data (both idempotent; mock self-skips on live data)
pnpm db:migrate
pnpm scrape:mock

# ── 3. background ingestion loop with auto-restart ─────────────────────────
# A watch crash must never take the web server down. Backoff 15s→300s,
# reset to 15s after 10 healthy minutes.
watch_loop() {
  local backoff=15
  while true; do
    local started
    started=$(date +%s)
    pnpm scrape:watch || true
    local ran=$(( $(date +%s) - started ))
    if (( ran >= 600 )); then backoff=15; fi
    echo "entrypoint: scrape:watch exited after ${ran}s — restarting in ${backoff}s"
    sleep "$backoff"
    backoff=$(( backoff * 2 )); (( backoff > 300 )) && backoff=300
  done
}
watch_loop &

# ── 4. web server — exec'd so it is tini's direct child and receives SIGTERM
cd apps/web
exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"

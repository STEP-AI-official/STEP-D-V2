#!/usr/bin/env bash
# Runs ON the GCP VM. Rebuilds and restarts the api container, then health-checks.
#
# Usage (via deploy.ps1 or manually on the VM):
#   deploy/deploy.sh             # sync + build + restart
#   deploy/deploy.sh --no-build  # restart only (uses existing image)
set -euo pipefail

APP_DIR=/home/STEPAI05/app
ENV_FILE=apps/api/.env.production
COMPOSE_FILE=docker-compose.prod.yml
HEALTH_URL=http://127.0.0.1:8010/api/health

cd "$APP_DIR"

BUILD=true
for arg in "$@"; do
    [[ "$arg" == "--no-build" ]] && BUILD=false
done

STEP=1
total() { $BUILD && echo 3 || echo 2; }

# ── 1. Build ──────────────────────────────────────────────────────────────────
if $BUILD; then
    echo "==> [$STEP/$(total)] Building api image..."
    sudo docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api
    STEP=$((STEP + 1))
fi

# ── 2. Restart ────────────────────────────────────────────────────────────────
echo "==> [$STEP/$(total)] Restarting api container..."
sudo docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate api
STEP=$((STEP + 1))

# ── 3. Health check ───────────────────────────────────────────────────────────
echo "==> [$STEP/$(total)] Health check (60 s timeout)..."
for i in $(seq 1 30); do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
        echo ""
        echo "==> OK — API is healthy. Deploy complete."
        exit 0
    fi
    printf "    Attempt %d/30...\r" "$i"
    sleep 2
done

echo ""
echo "==> FAILED — health check timed out. Last 60 log lines:"
sudo docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs --tail=60 api
exit 1

#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRANCH="${CLAWPM_DEPLOY_BRANCH:-main}"
SKIP_GIT_PULL="${CLAWPM_SKIP_GIT_PULL:-0}"

cd "$PROJECT_DIR"

if [[ ! -f .env ]]; then
  echo "[FAIL] Missing $PROJECT_DIR/.env"
  exit 1
fi

if [[ ! -d .git ]]; then
  echo "[FAIL] $PROJECT_DIR is not a git working tree"
  exit 1
fi

if [[ "$SKIP_GIT_PULL" != "1" ]]; then
  echo "[INFO] Syncing repository to origin/${BRANCH}..."
  git fetch origin "$BRANCH"
  git checkout -B "$BRANCH" "origin/${BRANCH}"
  git reset --hard "origin/${BRANCH}"
  git clean -fd -e .env -e data -e node_modules -e server/node_modules -e web/node_modules
fi

echo "[INFO] Validating docker compose config..."
docker compose config >/dev/null

echo "[INFO] Rebuilding and starting ClawPM..."
docker compose up -d --build --remove-orphans

echo "[INFO] Waiting for health check..."
for attempt in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:3210/health >/dev/null; then
    echo "[OK] ClawPM is healthy."
    docker compose ps
    curl -fsS http://127.0.0.1:3210/health
    exit 0
  fi
  sleep 3
done

echo "[FAIL] ClawPM did not become healthy in time."
docker compose logs --tail=200 clawpm || true
exit 1

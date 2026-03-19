#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=("pnpm")
elif command -v corepack >/dev/null 2>&1; then
  PNPM_CMD=("corepack" "pnpm")
elif [[ -x "$HOME/.local/bin/pnpm" ]]; then
  PNPM_CMD=("$HOME/.local/bin/pnpm")
else
  echo "[FAIL] pnpm not found. Install pnpm or enable Corepack first."
  echo "       Recommended: corepack enable"
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "[INFO] Loaded environment from .env"
else
  echo "[INFO] No .env found, using local defaults."
fi

if [[ ! -d node_modules ]]; then
  echo "[INFO] Installing dependencies..."
  "${PNPM_CMD[@]}" install
fi

mkdir -p data

PORT="${CLAWPM_PORT:-3210}"
TOKEN="${CLAWPM_API_TOKEN:-dev-token}"
DB_PATH="${CLAWPM_DB_PATH:-$SCRIPT_DIR/data/clawpm.db}"

echo "============================================"
echo "  ClawPM - Self-hosted PM with MCP"
echo "============================================"
echo ""
echo "[OK] Starting ClawPM server (backend + frontend)..."
echo ""
echo "  Backend API:  http://localhost:${PORT}"
echo "  Frontend:     http://localhost:5173"
echo "  MCP SSE:      http://localhost:${PORT}/mcp/sse"
echo "  Health Check: http://localhost:${PORT}/health"
echo "  Database:     ${DB_PATH}"
echo "  API Token:    ${TOKEN}"
echo ""
echo "  Press Ctrl+C to stop all services."
echo "============================================"
echo ""

backend_pid=""
frontend_pid=""

cleanup() {
  echo ""
  echo "[INFO] Stopping all services..."
  if [[ -n "$backend_pid" ]]; then
    kill "$backend_pid" 2>/dev/null || true
  fi
  if [[ -n "$frontend_pid" ]]; then
    kill "$frontend_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

"${PNPM_CMD[@]}" dev &
backend_pid="$!"
sleep 2
"${PNPM_CMD[@]}" dev:web &
frontend_pid="$!"

echo "[OK] Both services started. Press Ctrl+C to stop."
wait

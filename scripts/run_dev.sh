#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_HOST="${AZVISION_BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${AZVISION_BACKEND_PORT:-8000}"
FRONTEND_HOST="${AZVISION_FRONTEND_HOST:-127.0.0.1}"
FRONTEND_PORT="${AZVISION_FRONTEND_PORT:-5173}"

if [ ! -d "$ROOT_DIR/backend/.venv" ]; then
  echo "Missing backend virtualenv: $ROOT_DIR/backend/.venv"
  echo "Create it first: cd $ROOT_DIR/backend && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  exit 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "Missing frontend dependencies: $ROOT_DIR/frontend/node_modules"
  echo "Install first: cd $ROOT_DIR/frontend && npm install"
  exit 1
fi

wait_for_url() {
  local label="$1"
  local url="$2"
  local i
  for i in $(seq 1 30); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$label ready: $url"
      return 0
    fi
    sleep 1
  done
  echo "$label did not become ready: $url"
  return 1
}

cleanup() {
  if [ -n "${BACKEND_PID:-}" ]; then
    pkill -P "$BACKEND_PID" 2>/dev/null || true
    if kill -0 "$BACKEND_PID" 2>/dev/null; then
      kill "$BACKEND_PID" 2>/dev/null || true
    fi
  fi
  if [ -n "${FRONTEND_PID:-}" ]; then
    pkill -P "$FRONTEND_PID" 2>/dev/null || true
    if kill -0 "$FRONTEND_PID" 2>/dev/null; then
      kill "$FRONTEND_PID" 2>/dev/null || true
    fi
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

echo "Starting AzVision backend on http://$BACKEND_HOST:$BACKEND_PORT"
(
  cd "$ROOT_DIR/backend"
  source .venv/bin/activate
  exec uvicorn app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload
) &
BACKEND_PID=$!

echo "Starting AzVision frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
(
  cd "$ROOT_DIR/frontend"
  exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

echo
echo "AzVision dev stack is starting."
wait_for_url "Backend" "http://$BACKEND_HOST:$BACKEND_PORT/healthz"
wait_for_url "Frontend" "http://$FRONTEND_HOST:$FRONTEND_PORT/"
echo "API: http://$BACKEND_HOST:$BACKEND_PORT"
echo "UI:  http://$FRONTEND_HOST:$FRONTEND_PORT"
echo "Press Ctrl+C to stop both processes."

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" || true
    echo "Backend process exited; stopping frontend."
    exit 1
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID" || true
    echo "Frontend process exited; stopping backend."
    exit 1
  fi
  sleep 1
done

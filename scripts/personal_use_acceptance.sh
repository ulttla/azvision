#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="${AZVISION_BACKEND_URL:-http://127.0.0.1:8000}"
RUN_LIVE_SMOKE="${AZVISION_ACCEPTANCE_LIVE_SMOKE:-1}"
STARTED_BACKEND_PID=""

cleanup() {
  if [ -n "$STARTED_BACKEND_PID" ]; then
    pkill -P "$STARTED_BACKEND_PID" 2>/dev/null || true
    kill "$STARTED_BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_backend() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS "$BACKEND_URL/healthz" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

start_backend_if_needed() {
  if curl -fsS "$BACKEND_URL/healthz" >/dev/null 2>&1; then
    echo "[ok] using existing backend at $BACKEND_URL"
    return 0
  fi

  echo "[info] starting temporary backend for personal-use smoke"
  (
    cd "$ROOT_DIR/backend"
    source .venv/bin/activate
    exec uvicorn app.main:app --host 127.0.0.1 --port 8000
  ) >/tmp/azvision-personal-acceptance-backend.log 2>&1 &
  STARTED_BACKEND_PID=$!

  if ! wait_for_backend; then
    echo "[fail] temporary backend did not become healthy"
    tail -120 /tmp/azvision-personal-acceptance-backend.log || true
    exit 1
  fi
  echo "[ok] temporary backend healthy"
}

echo "== AzVision personal-use acceptance =="
echo "ROOT_DIR=$ROOT_DIR"

cd "$ROOT_DIR"

echo "[1/10] docs mirror check"
bash scripts/check_doc_mirror.sh

echo "[2/10] script syntax"
bash -n scripts/run_dev.sh
bash -n scripts/check_personal_use_ready.sh
bash -n scripts/backup_sqlite.sh
bash -n scripts/verify_sqlite_backup.sh
bash -n scripts/personal_use_smoke.sh
bash -n scripts/snapshot_compare_smoke.sh
bash -n scripts/cost_report_smoke.sh

echo "[3/10] local readiness preflight"
scripts/check_personal_use_ready.sh

echo "[4/10] backend tests"
(
  cd backend
  .venv/bin/python -m pytest -q
)

echo "[5/10] frontend build"
npm --prefix frontend run build

echo "[6/10] SQLite backup"
scripts/backup_sqlite.sh

echo "[7/10] SQLite backup verification"
scripts/verify_sqlite_backup.sh

echo "[8/10] personal workflow smoke"
if [ "$RUN_LIVE_SMOKE" = "1" ]; then
  start_backend_if_needed
  scripts/personal_use_smoke.sh
else
  echo "[skip] personal workflow smoke skipped because AZVISION_ACCEPTANCE_LIVE_SMOKE=$RUN_LIVE_SMOKE"
fi

echo "[9/10] snapshot compare smoke"
start_backend_if_needed
scripts/snapshot_compare_smoke.sh

echo "[10/10] cost report smoke"
start_backend_if_needed
scripts/cost_report_smoke.sh

echo "PASS: AzVision personal-use acceptance completed"

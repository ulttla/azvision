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

echo "[1/13] docs mirror check"
bash scripts/check_doc_mirror.sh

echo "[2/13] script syntax"
bash -n scripts/run_dev.sh
bash -n scripts/check_personal_use_ready.sh
bash -n scripts/backup_sqlite.sh
bash -n scripts/verify_sqlite_backup.sh
bash -n scripts/personal_use_smoke.sh
bash -n scripts/snapshot_compare_smoke.sh
bash -n scripts/cost_report_smoke.sh
bash -n scripts/cost_insights_smoke.sh
python3 -m py_compile scripts/sqlite_health_check.py
python3 -m py_compile scripts/archive_retention_dry_run.py

echo "[3/13] local readiness preflight"
scripts/check_personal_use_ready.sh

echo "[4/13] backend tests"
(
  cd backend
  .venv/bin/python -m pytest -q
)

echo "[5/13] frontend build"
npm --prefix frontend run build

echo "[6/13] frontend semantics smokes"
npm --prefix frontend run smoke:semantics

echo "[7/13] SQLite health check"
scripts/sqlite_health_check.py

echo "[8/13] archive retention dry-run smoke"
retention_json_file="$(mktemp -t azvision-retention-dry-run.XXXXXX.json)"
python3 scripts/archive_retention_dry_run.py --db backend/azvision.db --workspace local-demo --dry-run >"$retention_json_file"
python3 - "$retention_json_file" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    payload = json.load(f)
if payload.get("dry_run") is not True:
    raise SystemExit("archive retention dry-run did not report dry_run=true")
print(
    "[ok] archive retention dry-run "
    f"archives={payload.get('archive_count')} "
    f"candidates={payload.get('candidate_count')} "
    f"estimated_freed_bytes={payload.get('estimated_freed_bytes')}"
)
PY
rm -f "$retention_json_file"

echo "[9/13] SQLite backup"
scripts/backup_sqlite.sh

echo "[10/13] SQLite backup verification"
scripts/verify_sqlite_backup.sh

echo "[11/13] personal workflow smoke"
if [ "$RUN_LIVE_SMOKE" = "1" ]; then
  start_backend_if_needed
  scripts/personal_use_smoke.sh
else
  echo "[skip] personal workflow smoke skipped because AZVISION_ACCEPTANCE_LIVE_SMOKE=$RUN_LIVE_SMOKE"
fi

echo "[12/13] snapshot compare smoke"
start_backend_if_needed
scripts/snapshot_compare_smoke.sh

echo "[13/13] cost report smoke"
start_backend_if_needed
scripts/cost_report_smoke.sh
scripts/cost_insights_smoke.sh

echo "PASS: AzVision personal-use acceptance completed"

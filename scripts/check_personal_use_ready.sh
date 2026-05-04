#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT_CODE=0

ok() {
  echo "[ok] $1"
}

warn() {
  echo "[warn] $1"
}

fail() {
  echo "[fail] $1"
  EXIT_CODE=1
}

require_path() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    ok "$label: $path"
  else
    fail "$label missing: $path"
  fi
}

echo "== AzVision personal-use readiness check =="
echo "ROOT_DIR=$ROOT_DIR"

require_path "root env file" "$ROOT_DIR/.env"
require_path "backend virtualenv" "$ROOT_DIR/backend/.venv"
require_path "frontend dependencies" "$ROOT_DIR/frontend/node_modules"

if [ -x "$ROOT_DIR/scripts/run_dev.sh" ]; then
  ok "run script executable"
else
  warn "run script is not executable: scripts/run_dev.sh"
fi

if [ -x "$ROOT_DIR/scripts/personal_use_smoke.sh" ]; then
  ok "personal smoke script executable"
else
  warn "personal smoke script is not executable: scripts/personal_use_smoke.sh"
fi

if [ -x "$ROOT_DIR/scripts/backup_sqlite.sh" ]; then
  ok "backup script executable"
else
  warn "backup script is not executable: scripts/backup_sqlite.sh"
fi

if [ -x "$ROOT_DIR/scripts/verify_sqlite_backup.sh" ]; then
  ok "backup verifier executable"
else
  warn "backup verifier is not executable: scripts/verify_sqlite_backup.sh"
fi

if [ -x "$ROOT_DIR/scripts/personal_use_acceptance.sh" ]; then
  ok "personal acceptance script executable"
else
  warn "personal acceptance script is not executable: scripts/personal_use_acceptance.sh"
fi

ROOT_DB="$ROOT_DIR/azvision.db"
BACKEND_DB="$ROOT_DIR/backend/azvision.db"
if [ -f "$ROOT_DB" ] || [ -f "$BACKEND_DB" ]; then
  ok "local SQLite state present"
  if [ -f "$BACKEND_DB" ]; then
    ok "canonical run_dev SQLite path: backend/azvision.db"
  fi
  if [ -f "$ROOT_DB" ] && [ -f "$BACKEND_DB" ]; then
    warn "both azvision.db and backend/azvision.db exist; run_dev.sh uses backend/azvision.db. Do not remove either DB without backup and explicit approval."
  elif [ -f "$ROOT_DB" ]; then
    warn "only root azvision.db exists; run_dev.sh normally uses backend/azvision.db when AZVISION_DATABASE_URL is sqlite:///./azvision.db"
  fi
else
  warn "no local SQLite DB found yet; it will be created when the backend starts"
fi

if [ -x "$ROOT_DIR/backend/.venv/bin/python" ]; then
  (
    cd "$ROOT_DIR/backend"
    .venv/bin/python - <<'PY'
from app.core.config import get_settings
settings = get_settings()
checks = {
    "auth_ready": settings.auth_ready,
    "certificate_path_exists": settings.certificate_path_exists,
    "backend_import": True,
}
for key, value in checks.items():
    print(f"[{'ok' if value else 'warn'}] {key}={value}")
PY
  ) || warn "backend import/config probe failed"
else
  fail "backend python unavailable; cannot run import/config probe"
fi

cat <<'EOF'

Next commands:
  scripts/run_dev.sh
  scripts/personal_use_smoke.sh
  scripts/backup_sqlite.sh
  scripts/verify_sqlite_backup.sh
  scripts/personal_use_acceptance.sh

Optional focused smoke:
  scripts/simulation_smoke.sh  # creates then deletes a timestamped simulation record; do not run in a loop
EOF

exit "$EXIT_CODE"

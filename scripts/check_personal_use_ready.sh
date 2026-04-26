#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXIT_CODE=0

ok() {
  echo "[ok] $1"
}

warn() {
  echo "[warn] $1"
  EXIT_CODE=1
}

check_path() {
  local label="$1"
  local path="$2"
  if [ -e "$path" ]; then
    ok "$label: $path"
  else
    warn "$label missing: $path"
  fi
}

echo "== AzVision personal-use readiness check =="
echo "ROOT_DIR=$ROOT_DIR"

check_path "root env file" "$ROOT_DIR/.env"
check_path "backend virtualenv" "$ROOT_DIR/backend/.venv"
check_path "frontend dependencies" "$ROOT_DIR/frontend/node_modules"

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

if [ -f "$ROOT_DIR/azvision.db" ] || [ -f "$ROOT_DIR/backend/azvision.db" ]; then
  ok "local SQLite state present"
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
  warn "backend python unavailable; cannot run import/config probe"
fi

cat <<'EOF'

Next commands:
  scripts/run_dev.sh
  scripts/personal_use_smoke.sh
  scripts/backup_sqlite.sh
EOF

exit "$EXIT_CODE"

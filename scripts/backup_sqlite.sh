#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${AZVISION_BACKUP_ROOT:-$ROOT_DIR/backups/sqlite}"
TIMESTAMP="$(date +%Y%m%dT%H%M%S%z)"
DEST_DIR="$BACKUP_ROOT/$TIMESTAMP"
MANIFEST="$DEST_DIR/manifest.txt"

mkdir -p "$DEST_DIR"
: > "$MANIFEST"

copy_db() {
  local label="$1"
  local src="$2"
  if [ ! -f "$src" ]; then
    echo "SKIP $label: not found ($src)" | tee -a "$MANIFEST"
    return
  fi

  local dest="$DEST_DIR/${label}.db"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$src" ".backup '$dest'"
  else
    cp "$src" "$dest"
  fi
  local bytes
  bytes="$(wc -c < "$dest" | tr -d ' ')"
  local sha
  if command -v shasum >/dev/null 2>&1; then
    sha="$(shasum -a 256 "$dest" | awk '{print $1}')"
  else
    sha="sha256-unavailable"
  fi
  echo "OK $label bytes=$bytes sha256=$sha source=$src backup=$dest" | tee -a "$MANIFEST"
}

copy_db "project-root-azvision" "$ROOT_DIR/azvision.db"
copy_db "backend-azvision" "$ROOT_DIR/backend/azvision.db"

echo "Backup directory: $DEST_DIR" | tee -a "$MANIFEST"
echo "Manifest: $MANIFEST"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${AZVISION_BACKUP_ROOT:-$ROOT_DIR/backups/sqlite}"
BACKUP_DIR="${1:-}"

if [ -z "$BACKUP_DIR" ]; then
  if [ ! -d "$BACKUP_ROOT" ]; then
    echo "Backup root not found: $BACKUP_ROOT"
    exit 1
  fi
  BACKUP_DIR="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
fi

if [ -z "$BACKUP_DIR" ] || [ ! -d "$BACKUP_DIR" ]; then
  echo "Backup directory not found: ${BACKUP_DIR:-<empty>}"
  exit 1
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 not found; cannot verify SQLite backup integrity"
  exit 1
fi

MANIFEST="$BACKUP_DIR/manifest.txt"
if [ ! -f "$MANIFEST" ]; then
  echo "Manifest not found: $MANIFEST"
  exit 1
fi

found=0
for db in "$BACKUP_DIR"/*.db; do
  [ -e "$db" ] || continue
  found=1
  result="$(sqlite3 "$db" 'PRAGMA integrity_check;')"
  if [ "$result" != "ok" ]; then
    echo "FAIL $(basename "$db") integrity_check=$result"
    exit 1
  fi
  echo "OK $(basename "$db") integrity_check=ok"
done

if [ "$found" -ne 1 ]; then
  echo "No .db files found in backup directory: $BACKUP_DIR"
  exit 1
fi

if ! grep -q 'integrity_check=ok' "$MANIFEST"; then
  echo "Manifest does not record integrity_check=ok: $MANIFEST"
  exit 1
fi

echo "PASS: verified SQLite backup directory $BACKUP_DIR"

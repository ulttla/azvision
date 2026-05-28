#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_files=(
  backend/Dockerfile.production
  frontend/Dockerfile.production
  deploy/nginx/azvision.conf
  docker-compose.production.example.yml
  docs/PRODUCTION_DEPLOYMENT_GUIDE.md
)

for file in "${required_files[@]}"; do
  if [[ ! -s "$file" ]]; then
    echo "[fail] missing production profile file: $file" >&2
    exit 1
  fi
  echo "[ok] $file"
done

grep -q 'AZVISION_DEBUG: "false"' docker-compose.production.example.yml
grep -q 'AZVISION_ALLOWED_HOSTS.*set a concrete host' docker-compose.production.example.yml
grep -q 'AZVISION_CORS_ORIGINS.*set exact frontend origins' docker-compose.production.example.yml
grep -q '127.0.0.1:8080:8080' docker-compose.production.example.yml
grep -q 'uvicorn", "app.main:app"' backend/Dockerfile.production
grep -q 'npm run build' frontend/Dockerfile.production
grep -q 'proxy_pass http://backend:8000/api/' deploy/nginx/azvision.conf
grep -q 'Content-Security-Policy' deploy/nginx/azvision.conf

echo 'PASS: AzVision production profile smoke completed'

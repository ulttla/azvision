# Production Deployment Guide

This guide defines a safe path from local personal-use AzVision to a production-like hosted profile. It is a planning and preflight document only; it does not approve a live deploy.

## Current deployment baseline

- Backend: FastAPI app with `/healthz`, `/readyz`, and `/api/v1/healthz` readiness paths.
- Frontend: Vite app used in development.
- Database: SQLite local file.
- Compose: development-oriented stack.
- Auth: Azure read-only credentials configured through backend environment variables.

## Production-like target

A public beta deployment should use:

1. Backend API container running with `AZVISION_ENV=production` and `AZVISION_DEBUG=false`.
2. Frontend production build served as static files.
3. Reverse proxy such as Caddy or nginx for TLS, compression, and routing.
4. Explicit `AZVISION_ALLOWED_HOSTS` and `AZVISION_CORS_ORIGINS` values.
5. Health and readiness checks wired to the platform.
6. Backup and rollback procedure for persistent data.

## Required environment settings

| Variable | Production-like rule |
| --- | --- |
| `AZVISION_ENV` | `production` |
| `AZVISION_DEBUG` | `false` |
| `AZVISION_ALLOWED_HOSTS` | Concrete hostnames only, no wildcard |
| `AZVISION_CORS_ORIGINS` | Exact frontend origins only |
| `AZVISION_DATABASE_URL` | Dedicated persistent data path or managed DB in future |
| `OPENROUTER_API_KEY` | Backend-only secret store, never frontend |
| Azure credential variables | Backend-only secret store |

## Reverse proxy sketch

Recommended public path:

- `/` serves frontend static assets.
- `/api/` proxies to backend.
- `/healthz` and `/readyz` can be proxied for platform checks.
- TLS is terminated at the proxy or platform edge.

Security baseline:

- Redirect HTTP to HTTPS.
- Keep HSTS enabled in production.
- Do not expose internal backend ports publicly.
- Do not log credential values, provider keys, or request bodies containing secrets.

## Static frontend serving

The frontend should be built with:

```bash
npm --prefix frontend run build
```

A production profile should serve the generated static assets instead of running the Vite dev server.

## Health checks

| Endpoint | Expected use |
| --- | --- |
| `/healthz` | Process is alive |
| `/readyz` | Process can reach required local database |
| `/api/v1/healthz` | API route prefix check |
| `/api/v1/readyz` | API readiness check |

## No-public-exposure spike

Before any public deploy, run a private production-like spike:

1. Build frontend static assets.
2. Run backend with production-like env values.
3. Route through a local reverse proxy or private-only host.
4. Run backend tests, frontend build, browserless smoke, and health/readiness checks.
5. Confirm no secret values appear in logs or UI errors.

## Rollback and backup expectations

Public beta requires:

- Backup before schema or retention changes.
- Rollback plan for app image and data.
- Clear runbook for disabling public access without deleting data.
- Record of current commit and config profile for each release.

## Not yet included

- Real public DNS or TLS issuance.
- Cloud deployment automation.
- Account/login implementation.
- Managed database migration.
- Azure write/remediation features.

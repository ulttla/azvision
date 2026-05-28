# Public Beta Gap Analysis

AzVision의 현재 기준선은 개인/내부 데모에 강한 `personal-use v0.9`이다. 외부 사용자가 안전하게 접근하는 public beta로 전환하려면 아래 갭을 먼저 닫아야 한다.

## Readiness summary

| Area | Current status | Public beta impact | Priority |
| --- | --- | --- | --- |
| Core topology and graph workflow | Strong personal-use baseline | Main value path is usable after setup | P0 keep green |
| Snapshot, compare, archive signals | Usable baseline | Useful for repeat demos and regression checks | P0 keep green |
| Copilot provider path | Read-only MVP with safe fallback | Useful, but not account-aware | P1 |
| Login and workspace isolation | Not implemented | External users cannot be safely separated | P0 blocker |
| Production-like deployment | Dev compose only | Hosted beta cannot be operated safely yet | P0 blocker |
| Public onboarding and demo data | Not implemented | New users need Azure credentials before seeing value | P1 blocker |
| API protection and audit trail | Minimal headers, no rate limit/audit trail | Public traffic risk is too high | P1 blocker |
| Real cost ingestion | Noop provider | Cost insights are directional only | P2 |
| Retention pruning | Dry-run only | Long-running hosted data can grow unchecked | P2 |

## Gaps

### G1. Login, account, and workspace isolation

Current state:
- Workspace APIs still assume the local `local-demo` style scaffold.
- Workspace data separates project scope, not external users or accounts.
- There is no session token, account lifecycle, role model, or per-user workspace boundary.

Public beta requirement:
- Auth model with account identity, session lifecycle, and workspace membership.
- Clear separation between user-owned Azure credentials, snapshots, exports, and Copilot history.
- Minimum roles: owner and viewer.

Suggested sequence:
1. Define account, workspace member, and credential profile ownership model.
2. Add auth/session boundary before exposing hosted state.
3. Add tests that prove one workspace cannot read another user's data.

### G2. Production-like deployment path

Current state:
- `docker-compose.yml` is development-oriented.
- Frontend is served through Vite dev server, not a production static build path.
- Host validation defaults are still friendly to local development.

Public beta requirement:
- Production build and static serving path.
- Reverse proxy with TLS termination.
- Explicit allowed hosts and CORS origins.
- Health/readiness endpoints wired into deployment checks.

Suggested sequence:
1. Document a no-public-exposure production-like local profile.
2. Add production compose or container notes after the profile is validated.
3. Add hosted browser E2E smoke only after deployment profile exists.

### G3. API protection, logging, and audit trail

Current state:
- Security headers exist and are now extended with CSP/HSTS baseline.
- Rate limiting, request audit trail, and structured operational logging are not implemented.
- Public beta abuse handling is not yet defined.

Public beta requirement:
- Rate limiting by IP and account/workspace where possible.
- Request IDs and structured logs without secret values.
- Audit events for auth, credential profile changes, exports, snapshot deletion, and provider changes.

Suggested sequence:
1. Keep `debug=false` as the safe default.
2. Add rate-limit design and test plan before implementation.
3. Add audit event model once account/workspace identity is defined.

### G4. Public onboarding and demo data

Current state:
- The app is most useful after Azure credentials are configured.
- Mock topology exists at the service level, but there is no first-run public experience.

Public beta requirement:
- Demo workspace that works without Azure credentials.
- First-run guidance for choosing demo mode or Azure read-only setup.
- Sample topology with enough network, cost, simulation, and Copilot prompts to show the product value.

Suggested sequence:
1. Define the sample topology and guided tour.
2. Add sample workspace creation as a safe local path.
3. Gate live Azure setup behind clear read-only permission guidance.

### G5. Productized cost and simulation path

Current state:
- Cost ingestion is still a noop provider.
- Cost and simulation outputs are useful planning helpers, not billing-grade outputs.

Public beta requirement:
- Clear public labeling for estimated vs real cost data.
- Real Cost Management provider plan.
- Tests that ensure unknown cost data is never presented as real billing data.

## Entry criteria for public beta

Public beta should not start until all P0 and at least the initial P1 safety baseline are complete:

- P0: login/session model exists.
- P0: workspace isolation tests pass.
- P0: production-like deployment profile exists and passes health/readiness checks.
- P0: hosted browser smoke exists for login, demo workspace, topology load, snapshot, and export basics.
- P1: `debug=false` safe default confirmed.
- P1: explicit allowed hosts/CORS policy documented for hosted environments.
- P1: public demo workspace or onboarding path exists without requiring Azure credentials.
- P1: rate-limit and audit design accepted, with at least request ID logging planned.
- P1: rollback and backup path documented for hosted data.

## Launch risk table

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| User data mixing across workspaces | Critical | Account/workspace isolation and tests | Open |
| Hosted app exposes debug details | High | `debug=false` default, sanitized 5xx responses | Baseline improved |
| Public traffic abuse | High | Rate limit and request logging | Open |
| New users see empty product | High | Demo workspace and guided onboarding | Open |
| Deployment cannot be reproduced | High | Production deployment guide and smoke | In progress |
| Cost output is misunderstood as real billing | Medium | Clear labels and provider status | Open |
| Local database grows without pruning | Medium | Retention dry-run, future delete path with backup gate | Open |

## Recommended next slices

1. Production deployment guide and no-public-exposure spike.
2. Onboarding design with demo workspace requirements.
3. Auth/workspace isolation design before product-track code implementation.
4. Rate-limit and audit trail implementation after identity model is chosen.

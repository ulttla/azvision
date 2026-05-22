# AzVision 12h campaign C3 evidence

## 2026-05-22T16:12Z final validation spot-check

- Scope: final campaign validation/report polish, local-only.
- Repo context: `main...origin/main [ahead 25]`, HEAD `e969a1a`, working tree clean before evidence write.
- Validation:
  - `node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts` PASS.
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 31 tests.
- Inherited C2 validation bundle remains recorded in `tmp/lww-c2/evidence.md`:
  - frontend `smoke:semantics` PASS.
  - frontend build PASS.
  - backend Copilot pytest 31 tests PASS.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

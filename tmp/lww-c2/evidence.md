# AzVision 12h campaign C2 evidence

## 2026-05-22T11:11Z material-delta watchdog slice

- Scope: same Copilot MVP answer rendering hardening, local-only.
- Change: parser now recognizes Markdown h4 (`#### Heading`) sections in addition to h2/h3; smoke coverage updated with mixed h2/h3/h4 answer.
- Files:
  - `frontend/src/components/copilotAnswerParser.ts`
  - `scripts/copilot_answer_parser_smoke.mts`
- Validation:
  - `node --experimental-strip-types scripts/copilot_answer_parser_smoke.mts` PASS
  - `npm --prefix frontend run smoke:semantics` PASS
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T11:34Z provider content-parts normalization slice

- Scope: same Copilot provider parsing hardening, local-only.
- Change: OpenRouter/Ollama content extraction now normalizes string content and list-based text parts. This covers OpenAI-style `message.content` arrays without exposing secrets.
- Files:
  - `backend/app/services/copilot.py`
  - `backend/tests/test_copilot.py`
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 27 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T11:43Z Ollama content-parts coverage slice

- Scope: same Copilot provider parsing hardening, local-only.
- Change: Added Ollama-specific test coverage for list-based text content parts, sharing the same normalization path as OpenRouter.
- Files:
  - `backend/tests/test_copilot.py`
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 28 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T11:58Z docs evidence slice

- Scope: same Copilot MVP documentation and checkpoint quality.
- Change: Added `2026-05-22 C2` implementation status to `docs/COPILOT_LLM_MVP_PLAN.md`, covering h4 section parsing, provider content-parts normalization, and validation evidence.
- Commit: `4254126 docs(copilot): record c2 provider parsing evidence`.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T12:13Z non-text content-parts fallback slice

- Scope: same Copilot provider parsing hardening, local-only.
- Change: Added OpenRouter test coverage for non-text content parts so image/non-text-only payloads safely fall back instead of rendering unusable content or leaking external URLs.
- Files:
  - `backend/tests/test_copilot.py`
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 29 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T12:28Z docs consistency slice

- Scope: same Copilot MVP docs/evidence consistency, local-only.
- Change: Updated `docs/COPILOT_LLM_MVP_PLAN.md` C2 status from 28 to 29 backend tests and added the non-text-only provider content parts safe fallback note.
- Validation:
  - `node --experimental-strip-types scripts/copilot_answer_parser_smoke.mts` PASS
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 29 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T12:43Z Ollama non-text content-parts fallback slice

- Scope: same Copilot provider parsing hardening, local-only.
- Change: Added Ollama test coverage for non-text-only content parts so unusable image/non-text payloads safely fall back and do not leak source markers.
- Files:
  - `backend/tests/test_copilot.py`
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 30 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T12:58Z docs sync to 30-test state

- Scope: same Copilot MVP docs/evidence consistency, local-only.
- Change: Updated `docs/COPILOT_LLM_MVP_PLAN.md` C2 status to explicitly cover both OpenRouter and Ollama non-text-only provider fallback behavior and the current 30-test backend gate.
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 30 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T13:13Z mid-window validation bundle

- Scope: same Copilot MVP validation/checkpoint quality, local-only.
- Validation:
  - `npm --prefix frontend run smoke:semantics` PASS.
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 30 tests.
- Repo context at run: `main...origin/main [ahead 14]`, working tree clean before evidence append.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T13:28Z provider parsing semantics smoke slice

- Scope: same Copilot provider parsing validation, local-only.
- Change: Strengthened `scripts/copilot_api_semantics_smoke.mts` to assert the shared provider content-parts normalization helper and safe OpenRouter no-content fallback contract remain present.
- Validation:
  - `node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts` PASS.
  - `npm --prefix frontend run smoke:semantics` PASS.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T13:43Z production build validation slice

- Scope: same Copilot MVP validation/checkpoint quality, local-only.
- Validation:
  - `npm --prefix frontend run build` PASS.
- Repo context at run: `main...origin/main [ahead 16]`, working tree clean before evidence append.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T13:59Z midpoint review result

- Scope: C2 midpoint diff/docs/test consistency review for same Copilot MVP goal-line.
- Review verdict: GO.
- Findings:
  - No goal-line drift.
  - No provider token/secret exposure found.
  - Ollama/OpenRouter text-parts and non-text-only fallback paths are covered.
  - Validation bundle remains green: backend Copilot pytest 30 tests, parser smoke, API semantics smoke, frontend build, frontend smoke:semantics.
- Optional low-risk follow-up: add a small unit test for raw string items inside provider content arrays.
- Review file: `tmp/lww-c2/midpoint-review.md`.

## 2026-05-22T14:13Z raw string content-parts coverage slice

- Scope: same Copilot provider parsing hardening, local-only.
- Change: Added OpenRouter test coverage for raw string items inside provider content arrays, closing the midpoint review's optional low-risk follow-up.
- Files:
  - `backend/tests/test_copilot.py`
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 31 tests.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T14:28Z docs sync to 31-test state

- Scope: same Copilot MVP docs/evidence consistency, local-only.
- Change: Updated `docs/COPILOT_LLM_MVP_PLAN.md` C2 status to include raw string items in content arrays and the current 31-test backend gate.
- Validation:
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` PASS, 31 tests.
  - `node --experimental-strip-types scripts/copilot_api_semantics_smoke.mts` PASS.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

## 2026-05-22T14:43Z checkpoint prep slice

- Scope: C2 final validation/report prep, local-only.
- Change: Created `tmp/lww-c2/c2-checkpoint-draft.md` with C2 commits, validation evidence, midpoint review status, approval-needed table, and next steps.
- Guardrails: no git push, no Azure write/remediation, no gateway/config/update, no destructive cleanup, no secret handling.

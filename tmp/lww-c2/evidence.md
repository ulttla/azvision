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

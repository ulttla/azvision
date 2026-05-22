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

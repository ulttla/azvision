# AzVision Read-only LLM Copilot MVP Plan

Purpose: add a personal-use AI chat layer for AzVision without turning the project into a productized multi-user service.

## Decision

Build the first LLM copilot as a **read-only local/personal MVP**.

Default provider order:
1. **Ollama provider** for local Ollama and Ollama Cloud subscription models through the local Ollama API.
2. **OpenRouter provider** for hosted/API-key usage, especially when AzVision is deployed away from the Mac mini.
3. Keep the existing rule-based copilot as the safe fallback when no LLM provider is configured.

## Non-goals for this slice

- No Azure write/remediation.
- No public product login, multi-user permission model, or tenant sharing.
- No ChatGPT subscription OAuth clone.
- No frontend exposure of API keys or provider tokens.
- No raw secret, credential, or full environment dump in prompts.
- No long-term chat memory until the first read-only path is stable.

## Provider profiles

### Local Mac mini profile

Use local Ollama as the default provider. The model may be a local model or an Ollama Cloud subscription model.

```env
COPILOT_ENABLED=true
COPILOT_DEFAULT_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=deepseek-v4-pro:cloud
OPENROUTER_API_KEY=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=
```

### Azure hosted profile

Use OpenRouter as the default provider. `127.0.0.1:11434` in Azure points to the Azure host/container, not Gun's Mac mini.

```env
COPILOT_ENABLED=true
COPILOT_DEFAULT_PROVIDER=openrouter
OLLAMA_BASE_URL=
OLLAMA_MODEL=
OPENROUTER_API_KEY=<backend-env-only>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_MODEL=anthropic/claude-sonnet-4.5
```

If Azure must use Ollama, run Ollama inside the Azure VM/container environment or expose the Mac mini Ollama endpoint through a private tunnel/VPN. Prefer OpenRouter for the first hosted path.

## Backend shape

Keep a provider interface and add adapters behind it:

```text
CopilotProvider
  ├─ RuleBasedCopilotProvider
  ├─ OllamaCopilotProvider
  └─ OpenRouterCopilotProvider
```

Initial route additions:

- `GET /api/v1/copilot/providers`
  - report configured providers and health/status without secrets
- `POST /api/v1/copilot/chat`
  - accept provider override, workspace id, current-view context scope, current UI language, selected resource id, and user message

The existing workspace chat route can remain compatible while the new provider-aware route is introduced.

## Context builder

The first context builder should summarize, not dump:

- workspace id and inventory mode
- topology summary: resource counts, resource groups, key network/security resources
- selected resource summary when provided
- Path Analysis result summary when current view includes it
- Cost Insights and Simulation summaries when current view includes them
- known limits and confidence labels

Required prompt safety:

- redact secret-like fields and environment variable values
- cap context size
- label facts as `observed`, `inferred`, or `unknown`
- instruct provider to avoid Azure write/remediation instructions unless user explicitly asks outside AzVision and the app is later authorized for that mode
- carry the current UI language (`en`/`ko`) into context and tell LLM providers to answer in the matching language unless the user explicitly asks otherwise

## Frontend MVP

- Add a Copilot side panel or card.
- Provider selector: `Ollama`, `OpenRouter`, `Rule-based fallback`.
- Button: `Attach current view context`.
- Show provider status, model name, and `read-only` badge.
- Show answer sections:
  - `Summary`
  - `Observed evidence`
  - `Risks / unknowns`
  - `Suggested next read-only checks`
- Pass the active UI locale with each copilot request so Korean UI sessions receive Korean-first LLM guidance while English UI sessions stay English-first.

## Implementation status — 2026-05-20 C1

Completed for the local-only personal MVP path:

- Local `.env` enables the read-only Ollama copilot profile with `COPILOT_DEFAULT_PROVIDER=ollama` and `OLLAMA_MODEL=deepseek-v4-pro:cloud`.
- A shared `CopilotPanel` is used by Cost, Topology, Architecture, and Simulation views.
- The provider selector persists through the shared `azvision:copilot-provider:v1` localStorage key.
- Each view sends an explicit `current_view` value:
  - Cost: `cost-insights`
  - Topology: `topology`
  - Architecture: `architecture-view`
  - Simulation: `simulation`
- Backend context now includes `view_metadata` with view kind, focus, preferred evidence, and read-only answer guidance.
- Frontend can pass redacted-by-backend `view_context` summaries for view-specific UI state:
  - Cost: active filters, loading/error status, summary counts, top resources, and top recommendations.
  - Architecture: visible stage buckets, selected card, annotations, detail density, hidden/grouped counts.
  - Simulation: selected plan summary, priority counts, missing required fit types, report/template warning counts.
  - Topology: loaded/visible graph counts, filter/search state, node/relation counts, selected node details, and path analysis summary.
- LLM system prompts include the active view focus while keeping the no Azure write/remediation guard.
- Copilot tests isolate `Settings` and route fixtures from local `.env`/env provider settings so local personal Ollama config does not mask missing-config/provider-error paths or slow test runs.

Current validation evidence:

- `scripts/copilot_provider_smoke.sh` reports `chat_provider=ollama` and `llm_status=ok` after local backend reload.
- `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` passes with 23 tests.
- `npm --prefix frontend run build` passes.
- `npm --prefix frontend run smoke:semantics` passes.
- `node scripts/copilot_empty_answer_ui_smoke.mjs` passes as an explicit local UI gate when the Vite dev server is running; it mocks an empty Copilot answer and verifies localized fallback rendering plus omission of raw Cost filter values.
- `node scripts/architecture_view_visual_smoke.mjs` passes.
- `node scripts/simulation_view_visual_smoke.mjs` passes.
- `node scripts/topology_view_visual_smoke.mjs` passes and captures the outgoing topology Copilot request with graph/count/selected-node/path-analysis context fields, plus parsed inline Copilot answer section headings.
- Live read-only metadata smoke confirms `view_metadata.view_kind=architecture` and `view_metadata.view_kind=simulation` after local AzVision backend reload.
- Live `view_context` smoke confirms backend redaction of secret-like UI context fields before returning/sending context.
- View-specific quick prompts and default prompts are available in the shared Copilot panel so Cost, Topology, Architecture, and Simulation can start with context-appropriate read-only questions.
- Cost view now sends cost filter, summary, top resource, and top recommendation context so read-only answers can reference current cost triage state without re-querying Azure.
- Topology view now sends richer graph and path-analysis context so read-only answers can reference current filters, selected node, and path verdicts without re-querying Azure.
- Copilot answer rendering splits common inline section labels such as `**Summary:** text` / `Heading: text`, markdown h3, numbered heading, and bullet heading patterns into separate UI sections, and parser/visual smokes assert the parsed section headings.

Remaining follow-up candidates:

- Keep `topology_view_visual_smoke.mjs`, `architecture_view_visual_smoke.mjs`, `simulation_view_visual_smoke.mjs`, and `copilot_empty_answer_ui_smoke.mjs` as explicit local UI gates rather than adding them to the default browserless smoke bundle because they depend on a running Vite dev server and UI readiness.
- Optional live LLM UI smoke is available as `scripts/copilot_live_ui_smoke.mjs`; it is opt-in only via `AZVISION_LIVE_COPILOT_SMOKE=1` so normal smoke runs do not depend on LLM latency or provider availability.
- Consider deeper `CopilotPanel` UI-level coverage if a frontend test runner is introduced later; current default gate remains browserless smoke plus build, with explicit local UI gates available for visual/Copilot paths.

## Implementation status — 2026-05-22 C2

C2 continues the same local-only read-only Copilot MVP line from the C1 checkpoint.

- Copilot answer rendering now recognizes markdown h4 headings (`#### Heading`) in addition to h2/h3, bold labels, numbered labels, bullet labels, and standalone heading labels.
- Provider response normalization now accepts string content and list-based text parts for both Ollama and OpenRouter style payloads.
- OpenRouter and Ollama mocked provider tests cover text-part response shapes, including raw string items in content arrays, without exposing provider tokens.
- OpenRouter and Ollama non-text-only provider content parts use the existing safe fallback path instead of rendering unusable content.
- Current C2 validation evidence:
  - `node --experimental-strip-types scripts/copilot_answer_parser_smoke.mts` passes.
  - `npm --prefix frontend run smoke:semantics` passes.
  - `backend/.venv/bin/python -X faulthandler -m pytest backend/tests/test_copilot.py -q` passes with 31 tests.

## Implementation status — 2026-05-22 final hardening baseline

The 12h local-only Copilot MVP hardening campaign closed and was pushed to `main` at `b46695f`, with GitHub Actions CI passing afterward.

Current baseline:

- Copilot answer rendering recognizes markdown h3/h4 headings, bold label headings, numbered/bullet label headings, Korean heading labels, and empty/whitespace answer fallback behavior.
- Cost Copilot view context stays redacted: raw subscription/resource-group filter values and secret-like UI context fields are not rendered or forwarded as raw values.
- Ollama and OpenRouter response parsing accepts string content, list-based text parts, raw string content items, and safely falls back for non-text-only content parts.
- Provider status and chat fallback continue to avoid exposing backend API keys/tokens.
- The shared Copilot panel remains read-only and keeps rule-based fallback available when LLM providers are disabled, missing, or unreachable.

Current validation evidence:

- `scripts/personal_use_acceptance.sh` passes end-to-end.
- Backend pytest passes with 362 tests.
- `npm --prefix frontend run build` passes.
- `npm --prefix frontend run smoke:semantics` passes, including Copilot parser/API semantics smoke.
- Live personal-use smoke passes against local Azure read/topology: 54 nodes / 62 edges, Network Path Analysis smoke, manual node/edge path, snapshot path, and cleanup.
- Snapshot compare, cost report, and cost insights smokes pass under the acceptance wrapper.

Remaining follow-up candidates after this baseline:

- Keep explicit UI visual smokes as opt-in/local gates when view-specific Copilot rendering changes, because they require a running Vite dev server and UI readiness.
- Use `scripts/copilot_live_ui_smoke.mjs` only with `AZVISION_LIVE_COPILOT_SMOKE=1`; normal acceptance should not depend on live LLM latency or provider availability.
- Consider deeper `CopilotPanel` component-level coverage only if a frontend test runner is added later.
- Treat streaming responses, persistent chat history, hosted deployment polish, and any Azure write/remediation behavior as product-track follow-ups, not personal-use v0.9 blockers.

## Test and validation plan

- Provider config parsing tests.
- Redaction/context builder tests.
- Provider adapter mocked tests for Ollama and OpenRouter response normalization.
- API route tests for disabled/missing-key/provider-error paths.
- Frontend semantics smoke for provider selector, read-only badge, current-language forwarding, and no-secret rendering.
- View-level visual smoke for Architecture and Simulation copilot rendering and Korean UI regression checks.
- Keep `npm --prefix frontend run smoke:semantics`, frontend build, and backend pytest as the minimum validation gate.

## Historical first implementation slice recommendation

This section is retained as the original implementation slice outline. The provider/config/context/selector skeleton and local-only read-only hardening baseline are now implemented; use the current status sections above for readiness decisions.

Use a 5h Long Work Window for:

1. backend provider config and adapter skeletons
2. mocked non-streaming `/copilot/chat` path
3. context builder with redaction
4. frontend provider selector and read-only panel copy
5. docs and smoke coverage

Defer streaming responses, persistent chat history, hosted deployment polish, and Azure write/remediation planning.

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

## Test and validation plan

- Provider config parsing tests.
- Redaction/context builder tests.
- Provider adapter mocked tests for Ollama and OpenRouter response normalization.
- API route tests for disabled/missing-key/provider-error paths.
- Frontend semantics smoke for provider selector, read-only badge, current-language forwarding, and no-secret rendering.
- Keep `npm --prefix frontend run smoke:semantics`, frontend build, and backend pytest as the minimum validation gate.

## First implementation slice recommendation

Use a 5h Long Work Window for:

1. backend provider config and adapter skeletons
2. mocked non-streaming `/copilot/chat` path
3. context builder with redaction
4. frontend provider selector and read-only panel copy
5. docs and smoke coverage

Defer streaming responses, persistent chat history, hosted deployment polish, and Azure write/remediation planning.

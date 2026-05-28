# Copilot Persistence Plan

AzVision Copilot is currently a read-only, stateless assistant path. Public beta can keep stateless Copilot, but the product must document the boundary and avoid implying shared chat history exists.

## Current state

- Copilot provider selection is a frontend preference.
- Backend `/copilot/chat` normalizes provider output and falls back safely to rule-based answers.
- Copilot context is summarized and redacted before provider calls.
- Chat history is not persisted.

## Public beta options

| Option | Description | Beta readiness |
| --- | --- | --- |
| Stateless Copilot | No chat history, each request stands alone | Acceptable if clearly labeled |
| Workspace chat history | Store messages per workspace/account | Requires auth and workspace isolation |
| Provider preference persistence | Save default provider per workspace/account | Requires auth and audit trail |

## Required boundary for stateless beta

If public beta launches before chat persistence:

- UI copy must say chat history is not saved.
- Provider selection must be treated as local preference only.
- API responses must not imply memory across sessions.
- Copilot prompts must stay read-only and must not include secrets.

## Future storage model

Future tables after auth/workspace isolation:

```text
copilot_threads(id, workspace_id, account_id, title, created_at, updated_at, archived_at)
copilot_messages(id, thread_id, role, provider, content_redacted, created_at, metadata_json)
copilot_preferences(id, workspace_id, account_id, default_provider, created_at, updated_at)
```

Raw provider payloads should not be stored unless a redaction and retention policy exists.

## Audit events

Future persistence should emit safe audit events for:

- provider preference changed
- thread archived
- chat export generated

Do not audit raw prompts or raw answers by default.

## Implementation sequence

1. Add UI/API copy for stateless Copilot boundary.
2. Add auth/workspace isolation first.
3. Add provider preference persistence with audit event.
4. Add thread/message storage only after redaction and retention policy.
5. Add delete/export controls for user-owned chat history.

## No-go

- No shared chat history before workspace isolation.
- No provider credential values in stored context.
- No hidden persistence of prompts or answers.
- No Azure write/remediation capability through Copilot.

# C1→C2 transition defect — 2026-05-18 00:00 PDT

## What happened

C1 closeout completed and the transition orchestrator wake fired, but C2 did not effectively start until Gun asked why it was waiting.

## Impact

- C2 automatic handoff was not self-healing enough.
- User intervention was required to notice and force continuation.
- This should be treated as an LWW campaign transition defect, not a normal approval wait.

## Suspected cause

The runtime LWW hard-gate selected the recently closed C1 state for same-channel message checks and blocked transition/start wording as if it were a closeout/check-in without enough proof. A simplified channel update later succeeded, after which C2 state and wake registration were completed.

## Required follow-up

- Improve transition orchestrator path so C2 start uses a start-safe message shape and state selection does not get trapped on a closed previous chunk.
- Add a post-closeout transition assertion: if the orchestrator wake fires, it must either mark `campaign_transition_status=started` with start/read-back/wake ids, or send a visible BLOCKED message with manual resume phrase.
- Do not rely on user prompt as the recovery mechanism.

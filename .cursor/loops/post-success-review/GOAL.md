---
tags:
  - documentation
  - agents
  - loops
---
# TW — Extract post-success review from agentLoop.ts

**UUID:** `17bfc1cd-bf5d-43a7-9b8b-9bf7658aaa07`

## Goal

`agentLoop.ts` is too large. Extract the **post-success review + review-gate state
machine** into a dedicated module so the main loop reads as orchestration only.

The block to extract starts after verify passes (~`resolveShouldRunQualityReview`
through gate stop / fix-round `continue` / advisory paths) — roughly lines that
handle:

- full review vs `reviewBlockerRecheck`
- `unparseableReviewRetries`
- `reviewGate` / `maxReviewCycles` / `reviewGateHitl`
- logging + `gateStop` helper

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`).

- New module e.g. `src/loop/loopPostSuccessReview.ts` (name as you see fit) exports
  a function the loop calls with a clear input/output type (e.g. `continue` |
  `complete` | `stop` + reason).
- `agentLoop.ts` shrinks — no behavior change (refactor only).
- All existing `agentLoop.test.ts` review-gate cases pass unchanged in spirit
  (update imports/mocks only if needed).
- Add focused unit tests on the extracted module for gate branches (UNKNOWN retry,
  BLOCKERS fix round, HITL, advisory).
- No change to public API / CLI flags.

## Constraints

- **Refactor only** — same stderr messages and completion reasons unless a test
  forces a typo fix.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not tackle loopRisk profiles, pricing drift, or `--trust-config` in this loop.

## Out of scope

- Changing review pipeline (`loopPostReview.ts`)
- New features in the gate

## References

- `src/loop/agentLoop.ts` (post-success block)
- `src/review/loopPostReview.ts`
- Taskwarrior: `17bfc1cd-bf5d-43a7-9b8b-9bf7658aaa07`

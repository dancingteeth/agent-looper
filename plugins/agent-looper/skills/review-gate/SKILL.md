---
name: review-gate
description: >-
  Configure Agent Looper post-verify quality review and reviewGate — Proceed /
  Guide / Deny / Confirm, impact-severity gating, and when not to thrash another
  iteration. Use when writing REVIEWS.md or tuning postQualityReview.
---

# Review gate

After verify exits `0`, an optional **judge** writes `review.md`. Completion is still verify-first.

## Specs ≠ prompts

- `AGENTS.md` / skills → worker how-to
- `REVIEWS.md` → judge residual standard (not runtime worker prompt text)

Keep both sparse; delete laws models stop failing.

## Modes

| Setting | Behavior |
| --- | --- |
| `postQualityReview: false` | No judge |
| `postQualityReview: auto` | Judge when inferred risk ≠ low |
| `reviewGate: true` | Only **error + impact** findings reopen the worker (up to `maxReviewCycles`) |

Cosmetic nits must not burn another iteration.

## Residual judgment vocabulary

Proceed / Guide / Deny / Confirm — Guide packets feed the next worker when the gate continues.

## Judge runtime

- Default judge: Cursor (`reviewRuntime` unset → `cursor`)
- Set `reviewRuntime` + `reviewModel` to keep the judge off Cursor quota (Pi, OpenCode, Cline, …)
- Never use Composer Fast as the judge

## Reproduce filters (opt-in)

`reviewReproduce` / `reviewReproduceAgent` drop confabulated blockers that do not cite real changed paths.

---
tags:
  - documentation
  - agents
  - loops
---
# TW — Configurable loopRisk profiles

**UUID:** `de4144f2-9e6a-4cf6-8943-81efc49d4c5c`

## Goal

Move hardcoded `loopRisk` heuristics out of the harness into **consumer-configurable
profiles**:

1. Optional `## Loop risk inference` section in `REVIEWS.md` (HIGH / MEDIUM / LOW keywords)
2. Optional `loopRiskProfile` in `.cursor/agent-loop.repo.json` (keyword merge)
3. Optional per-loop `loopRiskProfile` + `reviewRisk` in `loop.json`

`postQualityReview: "auto"` and `buildRiskTriagePreamble()` must use the merged profile.
Harness defaults remain when overlays are absent (backward compatible).

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`).

- New module e.g. `src/loop/loopRiskProfile.ts` with:
  - `DEFAULT_LOOP_RISK_KEYWORDS` (today's regex keywords as lists)
  - `parseLoopRiskKeywordsFromReviewsMd()`
  - `resolveLoopRiskKeywords({ ctx, loopOverride })`
  - `inferLoopReviewRiskWithProfile()` used by `loopRisk.ts`
- `loop.json` fields (defaults preserve today):
  - `reviewRisk?: 'auto' | 'high' | 'medium' | 'low'` — default `'auto'`
  - `loopRiskProfile?: { high?, medium?, low? }` — merged on top of repo profile
- `agent-loop.repo.json` optional `loopRiskProfile` merge
- `buildRiskTriagePreamble(ctx)` renders Step 1 from resolved keywords
- `agent-loop-review-preview` shows `reviewRisk` + uses merged profile
- Unit tests for parser, merge, explicit `reviewRisk` override
- Update `templates/REVIEWS.md` with `## Loop risk inference` section + docs note

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Backward compatible: existing loops without new fields behave as before.
- Do not implement pricing drift or `--trust-config` in this loop.

## Out of scope

- Changing review-gate merge logic
- Replacing LLM risk classification in `review.md` (still judge-authored)

## References

- `src/loop/loopRisk.ts`
- `src/review/reviewPrompt.ts`
- Taskwarrior: `de4144f2-9e6a-4cf6-8943-81efc49d4c5c`

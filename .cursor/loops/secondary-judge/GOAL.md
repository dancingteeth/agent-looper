---
tags:
  - documentation
  - agents
  - loops
---
# TW — Multi-family secondary review judge (M3)

**UUID:** `adf66bf8-d52a-43e2-8009-756649cc32b2`

## Goal

Add an **opt-in second-family review** after the primary Cursor judge so
same-family under-flagging is less likely. Secondary runs via Cline
(`cline-pass` or `cline`) with a **dynamic import** — Cursor-only installs must
not load `@cline/sdk` unless this feature is enabled.

Pipeline:

```text
primary Cursor review → reproduce filters (if on) → optional secondary family → merge
```

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`). Checks live in
`verify.sh` / `VERIFY.skill.md`.

- Config (defaults **off**):
  - `reviewSecondaryRuntime?: 'cline-pass' | 'cline'` — unset = disabled
  - `reviewSecondaryModel?: string` — default `cline-pass/deepseek-v4-flash` for
    `cline-pass`, `deepseek/deepseek-chat` for `cline`
- When enabled, after primary (+ optional reproduce), run one more review prompt
  on the secondary runtime/model (`role: review` / phase review).
- **Cost control:** skip secondary when primary verdict is `ADVISORY` or `PASS`
  **and** there are zero gating (`error`+impact) blockers. Always skip when the
  feature is unset. Log `secondary review: skipped (…)` / `secondary review: …`.
- **Merge:** union of gating blockers from primary and secondary (match by
  impact+normalized title, same spirit as reproduce keep-list). Advisory-only
  findings do not need consensus. Final `parsed` used for the gate is the merge;
  `review.md` notes both models and any secondary-only gating blockers.
- Merge **respects** the impact-severity contract (only `error` + known impact
  gate).
- Unit tests mock both runners; CI must not need a live Cline/Cursor SDK.
- Enabling secondary must not break a Cursor-only install that never sets the
  flag (no static `@cline/sdk` import from the review path).

## Constraints

- Scope: `src/review/`, `src/loop/loopConfig*`, `src/loop/loopAgentConfig*` /
  `agentLoop` wiring, exports, tests, docs/roadmap + dogfood touch.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not implement M5 meta-review CLI or M4 Track B `verifyMode`.
- Do not change impact-severity tag set.

## Out of scope

- VNX-style “bugs vs architecture” split roles
- Requiring secondary on every consumer by default
- Phase 2c second-family *reproduce* (different feature)

## References

- `docs/loop-review-roadmap.md` §3
- `src/review/loopPostReview.ts`
- `src/agents/agentRunner.ts` (dynamic Cline import pattern)
- Taskwarrior: `adf66bf8-d52a-43e2-8009-756649cc32b2`

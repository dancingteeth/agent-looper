---
tags:
  - documentation
  - agents
  - loops
---
# TW — Reproduce-before-report (M2 phase 2a)

**UUID:** `b2185d70-2889-4eed-94c2-d99949954211` — stable key for `task <uuid>` and `loop.json` `taskwarriorUuid`.

## Goal

Add deterministic **reproduce-before-report** filters for gated review blockers so
`reviewGate` cannot stay open on error+impact findings that lack a citeable path
in the merge-base…HEAD diff (or cite paths outside that diff).

This is roadmap M2 phase **2a** only (cheap filters). Fresh-context agent reproduce
(2b) and second-family reproduce (2c) are out of scope.

## Acceptance criteria

Success is determined **only** by the verifier in `loop.json` (exit `0`), not by
the agent's assessment. Measurable checks live in `verify.sh` and `VERIFY.skill.md`.

- `reviewReproduce` config flag exists (default `false`).
- When enabled, error+impact blockers without a path citation are downgraded
  (`severity: warning`) and no longer gate.
- When enabled, error+impact blockers whose cited path is outside the changed-files
  set are downgraded similarly.
- Unit tests cover citation extract + path membership + filter integration.
- Prompt / REVIEWS.md document the citeable-path rule.

## Constraints

- Keep changes scoped to review pipeline + loop config (`src/review/`, `src/loop/loopConfig*`, exports).
- Do **not** edit this `GOAL.md` during the loop.
- Do not implement 2b/2c agent reproduce in this loop.

## Out of scope

- Multi-family secondary judge (M3).
- Meta-review CLI (M5).
- Publishing to npm.

## References

- `docs/loop-review-roadmap.md` §2
- Taskwarrior: `b2185d70-2889-4eed-94c2-d99949954211`
- Depends on M1 impact-severity (`8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6`)

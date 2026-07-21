---
tags:
  - documentation
  - agents
  - loops
---
# TW — Reproduce-before-report phase 2b (fresh-context agent)

**UUID:** `b2185d70-2889-4eed-94c2-d99949954211`

## Goal

After the deterministic path filter (2a), add an optional **fresh Cursor review
session** that only attempts to reproduce remaining error+impact blockers.
Candidates the reproduce agent cannot evidence must be **dropped** (downgraded to
warning) so they cannot keep `reviewGate` open.

Phase 2a (`reviewReproduce` path filter) is already shipped — do not rework it
except to call the new agent pass after it.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`). Checks live in
`verify.sh` / `VERIFY.skill.md`.

- Config: `reviewReproduceAgent` boolean (default `false`). When true (and
  `reviewReproduce` is on), after the 2a filter, remaining gating blockers are
  sent to a **new** Cursor agent session (`role: review`) with no prior review
  transcript.
- Prompt asks only: for each candidate, KEEP (cite evidence at `file:line`) or
  DROP. Output uses the same Blockers grammar; DROP → downgrade like 2a.
- `review.md` footer notes how many candidates the agent dropped.
- Unit tests mock the Cursor runner; no live SDK required for CI.
- Logs include `reproduce agent: …` on stderr.

## Constraints

- Scope: `src/review/`, `src/loop/loopConfig*`, exports, tests, docs/roadmap touch.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not implement multi-family 2c / M3 secondary judge.
- Keep Cursor-only installs free of `@cline/sdk` (dynamic import already).

## Out of scope

- Phase 2c second-family reproduce
- Meta-review CLI
- Changing impact-severity tags

## References

- `docs/loop-review-roadmap.md` §2 phase 2b
- `src/review/reviewReproduce.ts` (2a)
- `src/review/loopPostReview.ts` (pipeline)
- Taskwarrior: `b2185d70-2889-4eed-94c2-d99949954211`

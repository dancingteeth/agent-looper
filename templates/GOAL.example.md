---
tags:
  - documentation
  - agents
---
# Example loop — replace with your task

Describe what the agent should fix or implement.

**UUID:** `<taskwarrior-uuid>` (optional — for TW auto-complete via `loop.json`)

## Finish line (four parts)

| Part | This loop |
| --- | --- |
| **Outcome** | (one sentence) |
| **Scoreboard** | `verify.sh` exit `0` |
| **Permission** | `loop.json` `maxIterations` / `stagnationThreshold` |
| **Budget** | Stop when further work is not worth it — not "until perfect" |

## Golden (optional)

Path to a screenshot, fixture, or baseline to hold the result against. Omit if verify is enough.

## Research (optional, brownfield)

Link `RESEARCH.md` beside this file when the change lives in an unfamiliar area. Omit for tiny dogfooded loops.

## Acceptance criteria

Success is determined only by the verifier in `loop.json`, not by your assessment.

Edit `verify.sh` with measurable checks; see `VERIFY.skill.md`.

## Constraints

- Keep changes scoped to the goal.
- Do **not** edit `GOAL.md` during the loop.

## Out of scope

- Unrelated refactors.

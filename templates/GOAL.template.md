---
tags:
  - documentation
  - agents
---
# TW — Short title

**UUID:** `<taskwarrior-uuid>` — stable key for `task <uuid>` and `loop.json` `taskwarriorUuid` (never numeric ID alone).

## Finish line (four parts)

Name these before freeze. "Don't stop until perfect" is a demo, not a rule.

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal paragraph | What "done" looks like |
| **Scoreboard** | `verify.sh` (exit `0`) | How the agent knows without asking you |
| **Permission** | `loop.json` `maxIterations` / `stagnationThreshold` | How long it may keep going |
| **Budget** | below | Steps / time / spend cap — stop when further work is not worth it |

## Goal

What to achieve in one paragraph. Link canonical modules and runbooks.

## Golden (optional)

Path to a concrete example the critic / verify holds the work against (screenshot, fixture, baseline number, reference implementation). Omit when `verify.sh` is already the whole scoreboard. Computer-use loops: put the reference screenshot here. Visual / taste loops: [`GOAL.visual.template.md`](./GOAL.visual.template.md) (golden is a critic, not only `img src`).

## Budget

- `maxIterations`: (see `loop.json`; default from repo config)
- Wall-clock / spend: stop or HITL if exceeded (harness does not meter dollars yet — name the cap for humans)
- Do **not** set permission to "until perfect"

## Acceptance criteria

- Success is determined **only** by the verifier in `loop.json` (exit `0`), not by the agent's assessment.
- List observable outcomes (tests pass, guard asserts X, behavior Y).
- Measurable steps live in `verify.sh` and `VERIFY.skill.md` beside this file.

## Constraints

- Scope limits (directories, patterns from `AGENTS.md` / skills).
- **Do not edit this `GOAL.md` during the loop** — spec is frozen; change it only before re-running.

## Out of scope

- What the agent must not touch (deploy, unrelated refactors, HITL ops).

## References

- Related docs and tests.
- [`docs/competitive-steal-backlog.md`](../docs/competitive-steal-backlog.md) P7 — four-part finish line / golden

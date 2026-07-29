---
tags:
  - documentation
  - agents
  - loops
---
# TW — M8 computer-use verify example

**UUID:** `c288e732-7755-40ca-a468-a4d29c5757f9`

## Goal

Ship a **template-only** computer-use / visible UI verify example for product dogfood
loops (Kilo Speed pattern). Not a harness runtime feature — docs + scaffold that
consumers copy when the product under test needs UI drive.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`).

- Add `templates/GOAL.computer-use.template.md` describing visible UI verify + shell floor.
- Add `templates/verify.computer-use.example.sh` that documents hooks for Playwright /
  computer-use **but defaults to a measurable shell stub** (so CI can run without a display).
- Short section in `docs/verification-as-skill.md` or `docs/competitive-steal-backlog.md`
  pointing at the templates; note: default loops stay headless.
- Update `llms.txt` templates list.
- Focused verify: files exist + markdown links resolve; no live browser required in CI.

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Do not add Playwright as a package dependency of `@dancingteeth/agent-loop`.
- Do not change core loop engine.

## Out of scope

- Shipping a real Cursor computer-use integration inside the harness
- Requiring GUI in dogfood CI

## References

- `docs/competitive-steal-backlog.md` P2
- Kilo Speed self-testing post

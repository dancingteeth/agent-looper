---
tags:
  - documentation
  - agents
  - templates
  - computer-use
---
# TW — Visible UI verify: {feature}

**UUID:** `<taskwarrior-uuid>`

## Goal

Ship or fix **{feature}** with a **two-layer verifier**: a headless **shell floor**
(always runs in CI) plus optional **visible UI** checks when a display or
computer-use agent is available (Kilo Speed pattern).

The harness does not ship Playwright or Cursor computer-use — copy this template
and wire your product's UI driver beside `verify.sh`.

## Verify layers (finish line)

| Layer | When | What |
| --- | --- | --- |
| Shell floor | Every iteration / CI | Deterministic bash checks (tests, greps, artifact markers) — see `verify.sh` |
| Visible UI (optional) | Local dogfood / display available | Playwright script, screenshot diff, or computer-use agent steps documented in `VERIFY.skill.md` |

Success is **only** `verify` exit `0`. The shell floor must pass even when UI hooks
are skipped (no `$DISPLAY`, `SKIP_UI=1`).

## Golden (optional)

Path to a reference screenshot or recording the visible-UI layer diffs against.
The shell floor must still pass without it.

## Acceptance criteria

- Success is determined **only** by `loop.json` `verify` (exit `0`), not the agent's claim.
- `verify.sh` includes a measurable shell stub that passes without a browser.
- UI hooks are documented but **not required** in headless CI.
- Do not weaken the shell floor to "pass" via agent self-assessment alone.

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Do **not** add Playwright (or similar) as a dependency of `@dancingteeth/agent-looper`.
- Scope: directories and files you list here.

## Out of scope

- Shipping Cursor computer-use inside the harness runtime.
- Requiring GUI in dogfood CI.

## References

- [`templates/verify.computer-use.example.sh`](./verify.computer-use.example.sh) — shell floor + UI hook comments
- [`docs/verification-as-skill.md`](../docs/verification-as-skill.md) — hybrid dynamic verify

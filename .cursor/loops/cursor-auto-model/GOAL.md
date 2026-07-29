---
tags:
  - documentation
  - agents
  - loops
---
# TW — M8 Cursor Auto / Router opt-in

**UUID:** `ad4aba56-9e56-45c3-b669-52fa23688474`

## Goal

Add an **opt-in** path for Cursor Auto / Router as worker model **only if**
`@cursor/sdk` can accept an Auto model id **and** we can log which model was
routed. If the SDK does not expose this yet: document the blocker in
`docs/competitive-steal-backlog.md` and add a config comment / reserved field
without changing dogfood defaults (`composer-2.5`).

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`).

Pick **one** outcome and make verify assert it:

**A — SDK supports Auto:**
- Allow `model: "auto"` (or documented id) for `runtime: cursor` when explicitly set.
- Log routed model id on stderr when available.
- Dogfood default remains `composer-2.5`.
- Unit tests cover allowlist / validation.
- Docs in competitive backlog + loopAgentConfig comments.

**B — SDK does not support yet:**
- Add `docs/cursor-auto-router.md` (or backlog section) stating research result +
  required SDK surface (model id + routed id in run result).
- No change to default worker model.
- Optional: `loop.json` schema comment / README note that Auto is reserved.
- Verify asserts the doc exists and contains `blocked` or `SDK` + `routed`.

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Never make Auto the default for dogfood or reviewModel.
- Prefer B over fake A if SDK evidence is missing.

## Out of scope

- Admin Auto modes (Intelligence/Balance/Cost) product UI
- Changing Cline escalation ladder

## References

- https://cursor.com/blog/router
- `src/loop/loopAgentConfig.ts`
- `docs/competitive-steal-backlog.md` P2

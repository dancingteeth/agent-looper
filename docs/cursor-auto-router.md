---
tags:
  - documentation
  - competitive
  - cursor
  - agents
---
# Cursor Auto / Router — opt-in status (blocked)

Research for M8 loop `.cursor/loops/cursor-auto-model`
(`ad4aba56-9e56-45c3-b669-52fa23688474`).

## Verdict

**Blocked on SDK surface.** Cursor Router / Auto is available in the product
(Teams/Enterprise, CLI, and marketing claim “SDK”), but `@cursor/sdk` as used by
this harness does **not** yet expose:

1. A stable Auto model id we can set as `loop.json` `model` (e.g. `auto`,
   `auto-balance`) without breaking dogfood pinning.
2. A **routed model id** on the run result (which underlying model actually ran).

Without (2), Auto is unsafe for Agent Looper: `failure-domains.ndjson`, usage
estimates, and reviewGate forensics would lose which model produced the work.

## Dogfood default (unchanged)

```ts
CURSOR_LOOP_MODEL = 'composer-2.5'
```

Judge remains `grok-4.5` via `reviewModel`. Do **not** make Auto the default
worker or judge.

## Required SDK surface (to unblock)

When `@cursor/sdk` can satisfy all of:

- Accept an explicit Auto / Router model selector on create/run
- Return `routedModelId` (or equivalent) on each run / usage record
- Document Balance / Intelligence / Cost modes if they map to different ids

…then implement opt-in in `src/loop/loopAgentConfig.ts`:

- Allowlisted Auto ids for `runtime: "cursor"` only when set explicitly
- Log `routedModelId` on stderr and in iteration logs
- Keep `composer-2.5` as default

## References

- https://cursor.com/blog/router
- `docs/competitive-steal-backlog.md` P2
- `src/loop/loopAgentConfig.ts`

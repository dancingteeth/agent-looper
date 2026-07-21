---
name: loop-verify-secondary-judge
description: Verify M3 multi-family secondary review judge for agent-loop dogfood.
---

# Verify — secondary-judge (M3)

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun.
3. No partial handoff.
4. Scope: review pipeline + loop config for `reviewSecondaryRuntime` / merge.

## Checklist

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run \
  src/review/loopPostReview.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts
pnpm exec vitest run
bash .cursor/loops/secondary-judge/verify.sh
```

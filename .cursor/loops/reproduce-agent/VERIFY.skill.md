---
name: loop-verify-reproduce-agent
description: Verify M2b fresh-context reproduce agent for agent-loop dogfood.
---

# Verify — reproduce-agent (M2b)

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun.
3. No partial handoff.
4. Scope: review pipeline + loop config for `reviewReproduceAgent`.

## Checklist

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run \
  src/review/reviewReproduce.test.ts \
  src/review/reviewReproduceAgent.test.ts \
  src/review/loopPostReview.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts
pnpm exec vitest run
bash .cursor/loops/reproduce-agent/verify.sh
```

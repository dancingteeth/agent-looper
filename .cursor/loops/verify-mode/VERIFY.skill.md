---
name: loop-verify-verify-mode
description: Verify M4 Track B verifyMode harness for agent-loop dogfood.
---

# Verify — verify-mode (M4 Track B)

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun.
3. No partial handoff.
4. Scope: `verifyMode` / `verifySkill` in loop config + agentLoop wiring.

## Checklist

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run \
  src/loop/loopVerify.test.ts \
  src/loop/loopVerifySkill.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts
pnpm exec vitest run
bash .cursor/loops/verify-mode/verify.sh
```

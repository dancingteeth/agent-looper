---
name: loop-verify-post-success-review
description: Verify extract post-success review refactor for Agent Looper.
---

# Verify — post-success-review extract

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Refactor only — behavior unchanged.
3. Focused tests on extracted module + agentLoop integration.

## Checklist

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run src/loop/loopPostSuccessReview.test.ts src/loop/agentLoop.test.ts
pnpm exec vitest run
bash .cursor/loops/post-success-review/verify.sh
```

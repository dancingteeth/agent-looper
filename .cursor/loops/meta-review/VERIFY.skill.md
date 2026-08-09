---
name: loop-verify-meta-review
description: Verify M5 cross-loop meta-review CLI for Agent Looper dogfood.
---

# Verify — meta-review (M5)

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun.
3. No partial handoff.
4. Scope: meta-review CLI + artifact collection + prompt; read-only aggregator.

## Checklist

```bash
pnpm build
pnpm exec tsc --noEmit
pnpm exec vitest run src/review/metaReview.test.ts src/cli/meta-review.test.ts
pnpm exec vitest run
node dist/cli/meta-review.js --help
bash .cursor/loops/meta-review/verify.sh
```

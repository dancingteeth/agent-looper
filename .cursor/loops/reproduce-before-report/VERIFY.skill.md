---
name: loop-verify-reproduce-before-report
description: Verify M2 reproduce-before-report phase 2a for agent-loop dogfood.
---

# Verify — reproduce-before-report

## Rules

1. Verifier wins — exit `0` from `verify.sh` only.
2. Fail → fix → rerun from step 1.
3. No partial handoff.
4. Scope: `src/review/`, `src/loop/loopConfig*`, related tests/docs only.

## Checklist

### Step 1 — Typecheck

```bash
pnpm exec tsc --noEmit
```

### Step 2 — Focused tests

```bash
pnpm exec vitest run \
  src/review/reviewVerdict.test.ts \
  src/review/reviewReproduce.test.ts \
  src/review/loopPostReview.test.ts \
  src/loop/loopConfig.test.ts \
  src/loop/agentLoop.test.ts
```

### Step 3 — Full suite

```bash
pnpm exec vitest run
```

### Step 4 — Loop verifier

```bash
bash .cursor/loops/reproduce-before-report/verify.sh
```

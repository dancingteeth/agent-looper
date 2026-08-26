---
name: loop-verify
description: Verify cli-max-cost (maxCostUsd stop + HITL waiting).
---

# cli-max-cost verification

Hard gate: `bash .cursor/loops/cli-max-cost/verify.sh`

1. Typecheck
2. Focused vitest: loopConfig, runArgs, agentLoop, loopUsage
3. `README.md` contains `maxCostUsd`

Do not run a live paid agent as verify. Inject usage in unit tests.

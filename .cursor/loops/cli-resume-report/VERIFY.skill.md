---
name: loop-verify
description: Verify cli-resume-report (resume hints, report links, Telegram delta).
---

# cli-resume-report verification

Hard gate: `bash .cursor/loops/cli-resume-report/verify.sh`

1. `pnpm exec tsc --noEmit`
2. Focused vitest: `loopReport`, `loopRunReport`, `telegramNotify`, `loopFailureDomain`

Incomplete reports must contain `resume:` + `agent-loop run`. Sidecar verify must be linked, not only truncated. No new `replay` binary.

---
tags:
  - documentation
  - loops
  - permissions
---
# Loop permissions — cli-resume-report

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Report / exit UX | `src/loop/loopReport.ts`, `src/loop/loopRunReport.ts`, `src/cli/run.ts` (hint on incomplete exit), `src/loop/loopFailureDomain.ts` if needed, sibling tests |
| Writes beyond those paths | **Deny** | No Watch TUI, no setup wizard, no `maxCostUsd` schema |
| New CLI binaries | **Deny** | No `agent-loop replay` |
| Network / MCP / browser | **Deny** | Verify is unit tests |
| Secrets | **Deny** | |

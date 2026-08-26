---
tags:
  - documentation
  - loops
  - permissions
---
# Loop permissions — cli-max-cost

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Config + loop engine | `src/loop/loopConfig.ts`, `src/cli/runArgs.ts`, `src/loop/agentLoop.ts`, `src/integrations/hitlConfig.ts` and HITL call sites, `src/usage/loopUsage.ts`, tests, `README.md` config table |
| Writes beyond those paths | **Deny** | No Watch TUI, no setup wizard rewrite |
| Network / MCP / browser | **Deny** | No live billed run as verify |
| Secrets | **Deny** | |
| Billing product | **Deny** | User cap only — no credit ledger |

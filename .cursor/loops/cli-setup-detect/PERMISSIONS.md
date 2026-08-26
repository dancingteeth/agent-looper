---
tags:
  - documentation
  - loops
  - permissions
---
# Loop permissions — cli-setup-detect

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Setup CLI only | `src/cli/setup.ts`, `src/cli/setupFlow.ts`, `src/cli/setupMenus.ts`, new detect helper + tests |
| Writes beyond those paths | **Deny** | No `src/loop/` engine, no Watch |
| `cli-setup-wizard` verify | Must stay green | Do not weaken those fixtures |
| Network / MCP / browser | **Deny** | Detection is local import/PATH |
| Secrets | **Deny** | Wizard still never prints Telegram tokens |
| Repair mode | **Deny** this loop | Out of scope |

---
tags:
  - documentation
  - loops
  - permissions
---
# Loop permissions — cli-watch

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Loop-relevant dirs only | `src/cli/` (watch TUI, run dispatch, runArgs, shared chrome), `src/loop/agentLoop.ts` (phase hook only), sibling tests, `scripts/dist-manifest.json`, README / ARCHITECTURE CLI table |
| Writes beyond those paths | **Deny** | No setup-wizard flow rewrite, no Telegram/HITL redesign, no `maxCostUsd` |
| Human-only paths | **Deny** | No `.env`, Doppler, auth |
| Shell / package install | **Deny** new deps | `ink` / `ink-testing-library` already present |
| Network egress | **Deny** for verify | Offline |
| MCP / extra tools | **Deny** | |
| Browser / computer-use | **Deny** | No PTY e2e as verify |
| `reviewGate` | On | Residual quality |
| Secrets | **Deny** | |

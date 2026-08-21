---
tags:
  - documentation
  - loops
  - permissions
---
# Loop permissions — dsh-plugin

Governance for humans and the judge. Harness does not enforce every row.

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Loop-relevant dirs only | `plugins/dsh-agent-looper/`, `docs/dsh-plugin.md`, cross-links in `docs/cursor-marketplace-plugin.md` and `docs/agent-plugins.md` |
| Writes beyond those paths | **Deny** | No `src/loop/` orchestration edits |
| Human-only paths | **Deny** | No auth, deploy, `.env`, Doppler |
| Shell / package install | Opt-in | Plugin-local `package.json` only. Do **not** add `@deepseek-ai/dsh` to the root CLI package |
| Network egress | **Deny** for verify | Worker may read DSH docs. Verify is offline |
| MCP / extra tools | **Deny** | No MCP servers required |
| Browser / computer-use | **Deny** | Do not start `dsh web` as verify |
| `reviewGate` | On | Residual quality after verify |
| Secrets | **Deny** | No DeepSeek API keys in the repo or plugin config defaults |

## External / tool default-deny

No ambient MCP. DSH CLI (`npx @deepseek-ai/dsh web`) is **manual dogfood**, not a worker tool and not a verify dependency.

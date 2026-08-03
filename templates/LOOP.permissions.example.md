---
tags:
  - documentation
  - loops
  - template
  - permissions
---
# Loop permissions (example)

Copy beside a loop as `PERMISSIONS.md` (or keep notes in `GOAL.md` Constraints).
This is **governance documentation** for humans and the judge — the harness does
not enforce every row (Cursor/Cline own tool runtime). Prefer **default-deny**
for anything outside the frozen goal.

| Scope | Default | This loop |
| --- | --- | --- |
| Paths the worker may edit | Loop-relevant dirs only | e.g. `src/foo/`, `tests/foo/` |
| Writes beyond loop / package root | **Deny** | Allow only if GOAL says so |
| Shell / package install | Opt-in | `pnpm` test scripts only / or full |
| Network egress | **Deny** unless verify needs it | List hosts if allowed |
| MCP / extra tools | **Deny** (opt-in per loop) | Name each server/tool if enabled |
| Browser / computer-use | **Deny** | Opt-in via `RUN_UI=1` + computer-use GOAL |
| `reviewGate` | Off unless risk warrants | `true` / `false` |
| HITL (`reviewGateHitl` / Taskwarrior) | Off | When gate exhaust needs a human |
| Secrets / `.env` / credentials | **Deny** read+write | Never commit; use secret manager |

## External / tool default-deny

Do not assume “all connected MCP tools” are in play. If the worker needs a tool
or MCP server, name it here and in `GOAL.md` Constraints before freezing.
Ambient tool sprawl is out of scope for the harness — keep the loop sparse.

## Related

- Freeze discipline: `docs/unknowns-preflight.md`
- Judge overlay: `REVIEWS.md` / `templates/REVIEWS.md`
- Risk keywords: `## Loop risk inference` in `REVIEWS.md`

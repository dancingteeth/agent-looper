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
| Human-only paths (auth / payments / crypto / deploy) | **Deny** agent edit | Name paths the worker must not touch |
| Shell / package install | Opt-in | Lockfile / registry installs only; no `git+https` / arbitrary URLs by default |
| Network egress | **Deny** unless verify needs it | List hosts if allowed (default-deny) |
| MCP / extra tools | **Deny** (opt-in per loop) | Name each server/tool if enabled |
| Browser / computer-use | **Deny** | Opt-in via `RUN_UI=1` + computer-use GOAL |
| `reviewGate` | Off unless risk warrants | Residual *quality* only — not a sandbox |
| HITL (`reviewGateHitl` / Taskwarrior) | Off | When gate exhaust needs a human |
| Secrets / `.env` / credentials | **Deny** read+write | Secret manager / ephemeral tokens; never leave persistent secrets in the agent env |

## External / tool default-deny

Do not assume “all connected MCP tools” are in play. If the worker needs a tool
or MCP server, name it here and in `GOAL.md` Constraints before freezing.
Ambient tool sprawl is out of scope for the harness — keep the loop sparse.

## Model ≠ security control plane

Shell `verify`, OS/sandbox policy, and this matrix are the hard controls. The
quality-review judge (`reviewGate` / `REVIEWS.md`) is residual judgment after
verify — do **not** treat prompts or LLM-as-judge as substitutes for egress
deny, secret isolation, or install allowlists. (NVIDIA AI Red Team pattern:
architectural controls outside the model.)

## Related

- Freeze discipline: `docs/unknowns-preflight.md`
- Judge overlay: `REVIEWS.md` / `templates/REVIEWS.md`
- Optional AI-assisted verify extras: `templates/verify.ai-assisted.example.sh`
- Risk keywords: `## Loop risk inference` in `REVIEWS.md`

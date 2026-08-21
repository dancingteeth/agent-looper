---
name: design-loop
description: Freeze GOAL.md + verify.sh + loop.json only. Do not implement, SSH-walk production, or dump secrets. Use when the user wants an Agent Looper for a task.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# Design a loop

Agent Looper owns the grind. This chat **freezes the bundle**, then starts it as a **background bash job** (see `run-loop-in-dsh`). Do not implement the product yourself.

## Budget

Load this skill to freeze. After freeze, load `run-loop-in-dsh` (not all four). Write GOAL + verify + loop.json. **Do not foreground-bash `agent-loop run`.**

Do **not**:

- Implement CSS, restyle the product, rsync source trees, or test-deploy
- `find /` over SSH, cat every template, or curl every live page "to understand the surface"
- Dump Doppler / OpenCode / DSH credentials-local / auth files (they land in the session log)

Bounded preflight is enough: one `ssh … ls` (or a local path), copy the design spec into `.cursor/loops/<name>/`, freeze.

## Before freezing

1. Prefer an [unknowns preflight](https://github.com/dancingteeth/agent-looper/blob/main/docs/unknowns-preflight.md) when verify/deps are unfamiliar — as **questions in GOAL.md**, not a 40-step tour.
2. Design in chat → freeze. **Do not edit `GOAL.md` mid-run.** Freeze in **this** workspace. Pasting `/Users/…/other-repo` does not retarget `dsh web`.
3. Optional permissions matrix: tools/MCP/path writes default-deny until named.

## Bundle layout

```text
.cursor/loops/<name>/
  GOAL.md           # frozen spec
  loop.json         # verify, runtime, optional taskwarriorUuid
  verify.sh         # exit 0 = done
  VERIFY.skill.md   # optional; required when verifyMode is skill
```

## GOAL.md must have

- **Four-part finish line:** outcome, scoreboard (`verify.sh`), permission (`maxIterations` / stagnation), **loop budget** (stop when further work is not worth it — not "until perfect"). Separate from this skill's load Budget above.
- One clear **Goal** paragraph with canonical paths
- **Acceptance criteria** tied to the verifier (not agent self-assessment)
- **Constraints** + **Out of scope**
- Optional **Golden** path (screenshot, fixture, baseline) when verify needs a concrete example to hold against
- Metric loops: **revert** if measured worse than baseline ([`GOAL.metric.template.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/GOAL.metric.template.md))
- HITL via `hitlProvider` when humans must close residual work ([`docs/hitl-providers.md`](https://github.com/dancingteeth/agent-looper/blob/main/docs/hitl-providers.md))
- Taskwarrior **UUID** (never numeric ID alone) only when linking a TW goal task

## verify.sh must be measurable

- Exit `0` only when the finish line is met
- Prefer repo-local scripts over vibes (`true`, empty checks)
- For AI-touched work, consider secret/dep smoke from the harness templates

## loop.json essentials

- `verify`: shell command (usually `bash .cursor/loops/<name>/verify.sh`)
- `runtime` / `model` for the worker (`runtime: dsh` = harness spawns `dsh --profile headless`); optional `reviewRuntime` / `reviewModel` for the judge (`reviewRuntime: opencode` defaults the judge to Go DeepSeek V4 Pro; `reviewRuntime: dsh` defaults to official V4 Pro — omit `reviewModel` unless BYOK). Do **not** copy this GUI’s `opencode-go/…` slug onto `runtime: opencode` — that provider is DSH-private.
- `reviewGate: true` only when you want error+impact findings to reopen the worker
- Optional `plugins: ["…"]` for Agent Plugins skill packages (indexed in the prompt by default; `"skillDisclosure": "inline"` pastes full SKILL.md)
- Optional `verifyLogMode: "sidecar"` when verify dumps are large; default is `inline`

## Out of scope for this skill

- Starting the grind (see `run-loop-in-dsh` — background bash only)
- Installing the CLI (see `install-agent-looper`)
- Judging residual quality laws (see `review-gate`)

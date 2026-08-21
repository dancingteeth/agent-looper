---
name: design-loop
description: Design a measurable Agent Looper cycle — frozen GOAL.md, verify.sh finish line, unknowns preflight, and scope limits. Use when creating or tightening a loop before running Agent Looper.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# Design a loop

Agent Looper owns the grind; the human (or this chat) owns the finish line.

## Before freezing

1. Prefer an [unknowns preflight](https://github.com/dancingteeth/agent-looper/blob/main/docs/unknowns-preflight.md) when verify/deps are unfamiliar.
2. Design in chat → freeze. **Do not edit `GOAL.md` mid-run.**
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

- **Four-part finish line:** outcome, scoreboard (`verify.sh`), permission (`maxIterations` / stagnation), **budget** (stop when further work is not worth it — not "until perfect")
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
- `runtime` / `model` for the worker (`runtime: dsh` = PATH `dsh --profile headless`); optional `reviewRuntime` / `reviewModel` for the judge (`reviewRuntime: opencode` defaults the judge to Go DeepSeek V4 Pro; `reviewRuntime: dsh` defaults to official V4 Pro — omit `reviewModel` unless BYOK)
- `reviewGate: true` only when you want error+impact findings to reopen the worker
- Optional `plugins: ["…"]` for Agent Plugins skill packages (indexed in the prompt by default; `"skillDisclosure": "inline"` pastes full SKILL.md)
- Optional `verifyLogMode: "sidecar"` when verify dumps are large; default is `inline` (paste into the next prompt). See README / `docs/verification-as-skill.md`.

## Out of scope for this skill

- Running the harness (see `install-agent-looper`)
- Judging residual quality laws (see `review-gate`)

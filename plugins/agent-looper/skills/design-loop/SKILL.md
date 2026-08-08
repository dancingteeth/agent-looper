---
name: design-loop
description: >-
  Design a measurable Agent Looper cycle — frozen GOAL.md, verify.sh finish line,
  unknowns preflight, and scope limits. Use when creating or tightening a loop
  before running agent-loop.
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

- One clear **Goal** paragraph with canonical paths
- **Acceptance criteria** tied to the verifier (not agent self-assessment)
- **Constraints** + **Out of scope**
- Taskwarrior **UUID** (never numeric ID alone) when HITL is used

## verify.sh must be measurable

- Exit `0` only when the finish line is met
- Prefer repo-local scripts over vibes (`true`, empty checks)
- For AI-touched work, consider secret/dep smoke from the harness templates

## loop.json essentials

- `verify`: shell command (usually `bash .cursor/loops/<name>/verify.sh`)
- `runtime` / `model` for the worker; optional `reviewRuntime` / `reviewModel` for the judge
- `reviewGate: true` only when you want error+impact findings to reopen the worker
- Optional `plugins: ["…"]` for Agent Plugins skill packages the harness inlines

## Out of scope for this skill

- Running the harness (see `install-agent-looper`)
- Judging residual quality laws (see `review-gate`)

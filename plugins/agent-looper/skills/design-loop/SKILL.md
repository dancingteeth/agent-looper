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
  RESEARCH.md       # optional — frozen brownfield map (indexed, not inlined)
  loop.json         # verify (+ per-loop overrides). Repo `defaults` in `.cursor/agent-loop.repo.json` supply runtime/models unless this file sets them.
  verify.sh         # exit 0 = done
  VERIFY.skill.md   # optional; required when verifyMode is skill
```

## GOAL.md must have

- **Four-part finish line:** outcome, scoreboard (`verify.sh`), permission (`maxIterations` / stagnation), **budget** (stop when further work is not worth it — not "until perfect")
- One clear **Goal** paragraph with canonical paths
- **Acceptance criteria** tied to the verifier (not agent self-assessment)
- **Constraints** + **Out of scope**
- Optional **Golden** path (screenshot, fixture, baseline) when verify needs a concrete example to hold against
- Optional brownfield **Research** map ([`RESEARCH.example.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/RESEARCH.example.md)) when the change lives in an unfamiliar area — freeze beside GOAL; worker indexes the path
- Metric loops: **revert** if measured worse than baseline ([`GOAL.metric.template.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/GOAL.metric.template.md))
- Taste / visual loops: decide with the section below ([`GOAL.visual.template.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/GOAL.visual.template.md))
- HITL via `hitlProvider` when humans must close residual work ([`docs/hitl-providers.md`](https://github.com/dancingteeth/agent-looper/blob/main/docs/hitl-providers.md))
- Taskwarrior **UUID** (never numeric ID alone) only when linking a TW goal task

## verify.sh must be measurable

- Exit `0` only when the finish line is met
- Prefer repo-local scripts over vibes (`true`, empty checks)
- For AI-touched work, consider secret/dep smoke from the harness templates

## loop.json essentials

- `verify`: shell command (usually `bash .cursor/loops/<name>/verify.sh`)
- Repo **defaults** (`.cursor/agent-loop.repo.json` `defaults`): runtime, models, review, notify. Set once with `agent-loop-setup` (humans). This `loop.json` only needs `verify` plus overrides (`taskwarriorUuid`, `reviewGate`, a different `runtime`). loop.json wins on conflict.
- If no repo defaults yet: `runtime` / `model` for the worker (`runtime: dsh` = PATH `dsh --profile headless`); optional `reviewRuntime` / `reviewModel` for the judge (`reviewRuntime: opencode` defaults the judge to Go DeepSeek V4 Pro; `reviewRuntime: dsh` defaults to official V4 Pro — omit `reviewModel` unless BYOK)
- `reviewGate: true` when leftover taste or impact should reopen the worker after verify is green (not for smokes)
- Optional `plugins: ["…"]` for Agent Plugins skill packages (indexed in the prompt by default; `"skillDisclosure": "inline"` pastes full SKILL.md)
- Optional `verifyLogMode: "sidecar"` when verify dumps are large; default is `inline` (paste into the next prompt). See README / `docs/verification-as-skill.md`.

## Taste / visual loops (decide — not always-on)

Use this slice when a human will *look* at the result: homepage, landing, mockup, screenshot-as-hero, “fancy / pretty / sparkle,” brand UI. **Skip** for `*-smoke`, `example-fix`, harness probes, docs typos, and other keyword-low chores.

Before freeze, ask in their language (do not ask where files live):

1. Who has to like this? (named audience)
2. What would make them close the tab? (slow, wrong mood, missing/ugly art)
3. Where must it run? (this machine, phone, no wifi)

Translate into restraints they will never type. Measurable ones go in `verify.sh` (no remote CSS/JS, real hero file, no full-page `canvas` 2D if the machine must stay usable). The rest go in `VERIFY.skill.md`. Fill [`GOAL.visual.template.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/GOAL.visual.template.md).

**Golden** is a critic, not only `img src`. If you cannot see the attached image, do not invent a palette — ask, or freeze file facts (B&W vs color, crop chrome) instead of “just go whimsical.”

**Judge:** do **not** copy `postQualityReview: false` / `reviewGate: false` from `*-smoke` or `example-fix`. Omit those keys (harness default `postQualityReview: "auto"`). Set `reviewGate: true` on this slice so leftover look can reopen the worker. Freeze the golden mood in GOAL — the harness judge is text/diff, not pixels. Load `review-gate` only if you need a `REVIEWS.md` overlay; this section is enough to turn the referee on.

## Out of scope for this skill

- Running the harness (see `install-agent-looper`)
- Writing a full `REVIEWS.md` overlay (see `review-gate`) — still apply the judge keys above on visual loops

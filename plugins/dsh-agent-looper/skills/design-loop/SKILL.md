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
  RESEARCH.md       # optional — frozen brownfield map (indexed, not inlined)
  loop.json         # verify (+ per-loop overrides). Repo `defaults` supply runtime/models.
  verify.sh         # exit 0 = done
  VERIFY.skill.md   # optional; required when verifyMode is skill
```

## GOAL.md must have

- **Four-part finish line:** outcome, scoreboard (`verify.sh`), permission (`maxIterations` / stagnation), **loop budget** (stop when further work is not worth it — not "until perfect"). Separate from this skill's load Budget above.
- **Wiring (name before freeze):** EDGE DATA, REDUCER (`verify.sh`), FAILURE POLICY, HUMAN GATE
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
- Repo **defaults** (`.cursor/agent-loop.repo.json` `defaults`): runtime, models, review. Set once with `agent-loop-setup` (humans). This file only needs `verify` plus overrides. loop.json wins on conflict.
- If no repo defaults yet: `runtime` / `model` for the worker (`runtime: dsh` = harness spawns `dsh --profile headless`); optional `reviewRuntime` / `reviewModel` for the judge (`reviewRuntime: opencode` defaults the judge to Go DeepSeek V4 Pro; `reviewRuntime: dsh` defaults to official V4 Pro — omit `reviewModel` unless BYOK). Do **not** copy this GUI’s `opencode-go/…` slug onto `runtime: opencode` — that provider is DSH-private.
- `reviewGate: true` when leftover taste or impact should reopen the worker after verify is green (not for smokes)
- Optional `plugins: ["…"]` for Agent Plugins skill packages (indexed in the prompt by default; `"skillDisclosure": "inline"` pastes full SKILL.md)
- Optional `verifyLogMode: "sidecar"` when verify dumps are large; default is `inline`

## Taste / visual loops (decide — not always-on)

Use this slice when a human will *look* at the result: homepage, landing, mockup, screenshot-as-hero, “fancy / pretty / sparkle,” brand UI. **Skip** for `*-smoke`, `example-fix`, harness probes, docs typos, and other keyword-low chores.

Before freeze, ask in their language (do not ask where files live):

1. Who has to like this? (named audience)
2. What would make them close the tab? (slow, wrong mood, missing/ugly art)
3. Where must it run? (this machine, phone, no wifi)

Translate into restraints they will never type. Measurable ones go in `verify.sh` (no remote CSS/JS, real hero file, no full-page `canvas` 2D if the machine must stay usable). The rest go in `VERIFY.skill.md`. Fill [`GOAL.visual.template.md`](https://github.com/dancingteeth/agent-looper/blob/main/templates/GOAL.visual.template.md).

**Golden** is a critic, not only `img src`. If you cannot see the attached image, do not invent a palette — ask, or freeze file facts (B&W vs color, crop chrome) instead of “just go whimsical.”

**Judge:** do **not** copy `postQualityReview: false` / `reviewGate: false` from `*-smoke` or `example-fix`. Omit those keys (harness default `postQualityReview: "auto"`). Set `reviewGate: true` on this slice so leftover look can reopen the worker. Freeze the golden mood in GOAL — the harness judge is text/diff, not pixels. DSH `deepseek-official/deepseek-v4-flash-vision-exp` can `read_image` when the catalog sets `inputModalities: [text, image]` (`~/.dsh/settings.yaml`; headless `--patch` also declares it). This chat often loads only `design-loop` — do not skip the referee because `review-gate` was not loaded. Load `review-gate` only if you need a `REVIEWS.md` overlay.

## Out of scope for this skill

- Starting the grind (see `run-loop-in-dsh` — background bash only)
- Installing the CLI (see `install-agent-looper`)
- Writing a full `REVIEWS.md` overlay (see `review-gate`) — still apply the judge keys above on visual loops

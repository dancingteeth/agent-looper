---
tags:
  - documentation
  - agents
  - agentic_ai
  - loops
---
# AGENTS.md — Agent Looper (harness)

Repo-agnostic fix-until-green agent loop (`@dancingteeth/agent-looper`).

## Working agreements

- Prefer small, test-backed changes. Run focused vitest paths before broadening.
- Do not edit `GOAL.md` mid-loop.
- Taskwarrior: use **UUID** in `GOAL.md` / `loop.json` (`taskwarriorUuid`) when linking a TW goal task — never numeric ID alone.
- Dogfood: `costPreset` **minmax** (Hy3 worker + Grok judge when OpenCode Go and Cursor are both installed; Composer + Grok on Cursor-only). Not Cursor Auto / build.
- Optional peers: `@cursor/sdk` required for cursor runtime; `@cline/sdk` only for Cline paths; `@opencode-ai/sdk` + `opencode-ai` CLI for OpenCode; `@earendil-works/pi-coding-agent` for `runtime: pi`; `@openai/codex-sdk` for `runtime: codex`; PATH `dsh` for `runtime: dsh` (no `@deepseek-ai/dsh` on the CLI package); `@muse-code/sdk` + PATH `muse` for `runtime: muse`. Primary judge can use any of those via `reviewRuntime`.
- **Prompt diet on model bumps:** when upgrading worker/judge models, *delete* deterministic instructions from `AGENTS.md`, skills, and loop prompts before adding new ones. Stronger models need fewer hard rules (Claude Code cut ~80% of system prompt for this reason). Same for `REVIEWS.md` Project-specific laws: retire ones the worker stops failing.
- `AGENTS.md` = worker runtime; `REVIEWS.md` = judge standard — do not conflate (see `templates/REVIEWS.md`).
- Before freezing a new loop, prefer an [unknowns preflight](./docs/unknowns-preflight.md) when verify/deps are unfamiliar. Design in chat → freeze; do not edit `GOAL.md` mid-run. Optional [permissions matrix](./templates/LOOP.permissions.example.md) (tools/MCP default-deny).
- **Cursor Agent Shell:** you start `agent-loop` / `agent-loop-batch` in this chat. Attach ≥45m (`2700000`) with `notify_on_output` on `^AGENT_LOOP_DONE `. Never `block_until_ms: 0` (reaped ~5 min, `aborted` / pnpm 255 — harness 45m timeouts did not fire). Never tell the human to run it in their terminal — that is not an alternative you get to pick. Human terminal is only when **they** already asked to walk away (Telegram/HITL wake them). `AGENT_LOOP_DONE` is a sentinel, not a license to background.
- Competitive steals / skips: `docs/competitive-steal-backlog.md`.

## Layout

- `src/loop/` — harness orchestration
- `src/review/` — quality review, verdicts, prompts (incl. multi-runtime `reviewAgentRun`)
- `src/agents/` — agent SDK runners (one module per `runtime`)
- `src/plugins/` — Agent Plugins skills-only loader
- `plugins/agent-looper/` — Cursor marketplace companion (skills / rules / commands)
- `plugins/dsh-agent-looper/` — DeepSeek Harness companion (skills / command / bash guard)
- `templates/` — init scaffolds
- `.cursor/loops/` — dogfood loops for this repo

## Verify

Prefer measurable `verify.sh` + `VERIFY.skill.md` beside each loop (see `docs/verification-as-skill.md`).
For perf loops, start from `templates/GOAL.metric.template.md` + `templates/verify.metric.example.sh`.
For homepage / mockup / screenshot-as-hero loops, start from `templates/GOAL.visual.template.md` (do not copy smoke `reviewGate: false`).
Review residual judgment uses Proceed / Guide / Deny / Confirm (`templates/REVIEWS.md`); Guide packets feed the next worker on `reviewGate` continue.

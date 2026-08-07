---
tags:
  - documentation
  - agents
---
# AGENTS.md — agent-loop (harness)

Repo-agnostic fix-until-green agent loop (`@dancingteeth/agent-looper`).

## Working agreements

- Prefer small, test-backed changes. Run focused vitest paths before broadening.
- Do not edit `GOAL.md` mid-loop.
- Taskwarrior: use **UUID** in `GOAL.md` / `loop.json` (`taskwarriorUuid`), never numeric ID alone.
- Cursor-only dogfood: worker `composer-2.5`, judge `grok-4.5` via `reviewModel` (default `reviewRuntime: cursor`).
- Optional peers: `@cursor/sdk` required for cursor runtime; `@cline/sdk` only for Cline paths; `@opencode-ai/sdk` + `opencode-ai` CLI for OpenCode; `@earendil-works/pi-coding-agent` for `runtime: pi` (all dynamic import / PATH). Primary judge can use any of those via `reviewRuntime`.
- **Prompt diet on model bumps:** when upgrading worker/judge models, *delete* deterministic instructions from `AGENTS.md`, skills, and loop prompts before adding new ones. Stronger models need fewer hard rules (Claude Code cut ~80% of system prompt for this reason). Same for `REVIEWS.md` Project-specific laws: retire ones the worker stops failing.
- `AGENTS.md` = worker runtime; `REVIEWS.md` = judge standard — do not conflate (see `templates/REVIEWS.md`).
- Before freezing a new loop, prefer an [unknowns preflight](./docs/unknowns-preflight.md) when verify/deps are unfamiliar. Design in chat → freeze; do not edit `GOAL.md` mid-run. Optional [permissions matrix](./templates/LOOP.permissions.example.md) (tools/MCP default-deny).
- Competitive steals / skips: `docs/competitive-steal-backlog.md`.

## Layout

- `src/loop/` — harness orchestration
- `src/review/` — quality review, verdicts, prompts (incl. multi-runtime `reviewAgentRun`)
- `src/agents/` — Cursor / Cline / OpenCode / Pi runners
- `templates/` — init scaffolds
- `.cursor/loops/` — dogfood loops for this repo

## Verify

Prefer measurable `verify.sh` + `VERIFY.skill.md` beside each loop (see `docs/verification-as-skill.md`).
For perf loops, start from `templates/GOAL.metric.template.md` + `templates/verify.metric.example.sh`.
Review residual judgment uses Proceed / Guide / Deny / Confirm (`templates/REVIEWS.md`); Guide packets feed the next worker on `reviewGate` continue.

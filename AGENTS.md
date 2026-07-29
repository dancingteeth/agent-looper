---
tags:
  - documentation
  - agents
---
# AGENTS.md — agent-loop (harness)

Repo-agnostic fix-until-green agent loop (`@dancingteeth/agent-loop`).

## Working agreements

- Prefer small, test-backed changes. Run focused vitest paths before broadening.
- Do not edit `GOAL.md` mid-loop.
- Taskwarrior: use **UUID** in `GOAL.md` / `loop.json` (`taskwarriorUuid`), never numeric ID alone.
- Cursor-only dogfood: worker `composer-2.5`, judge `grok-4.5` via `reviewModel`.
- Optional peers: `@cursor/sdk` required for cursor runtime; `@cline/sdk` only for Cline paths (dynamic import).
- **Prompt diet on model bumps:** when upgrading worker/judge models, *delete* deterministic instructions from `AGENTS.md`, skills, and loop prompts before adding new ones. Stronger models need fewer hard rules (Claude Code cut ~80% of system prompt for this reason).
- Before freezing a new loop, prefer an [unknowns preflight](./docs/unknowns-preflight.md) when verify/deps are unfamiliar.

## Layout

- `src/loop/` — harness orchestration
- `src/review/` — quality review, verdicts, prompts
- `src/agents/` — Cursor / Cline runners
- `templates/` — init scaffolds
- `.cursor/loops/` — dogfood loops for this repo

## Verify

Prefer measurable `verify.sh` + `VERIFY.skill.md` beside each loop (see `docs/verification-as-skill.md`).
For perf loops, start from `templates/GOAL.metric.template.md` + `templates/verify.metric.example.sh`.
Competitive steals / skips: `docs/competitive-steal-backlog.md`.
Review residual judgment uses Proceed / Guide / Deny / Confirm (`templates/REVIEWS.md`); Guide packets feed the next worker on `reviewGate` continue.

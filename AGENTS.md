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

## Layout

- `src/loop/` — harness orchestration
- `src/review/` — quality review, verdicts, prompts
- `src/agents/` — Cursor / Cline runners
- `templates/` — init scaffolds
- `.cursor/loops/` — dogfood loops for this repo

## Verify

Prefer measurable `verify.sh` + `VERIFY.skill.md` beside each loop (see `docs/verification-as-skill.md`).

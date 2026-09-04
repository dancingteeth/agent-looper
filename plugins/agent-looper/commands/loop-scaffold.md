---
name: loop-scaffold
description: Scaffold a new Agent Looper bundle (GOAL, verify, loop.json) in the current repo.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# /loop-scaffold

Walk the user through creating one loop under `.cursor/loops/<name>/`.

## Steps

1. Confirm `@dancingteeth/agent-looper` is installed (`pnpm exec agent-loop --help`). If missing, follow the **install-agent-looper** skill.
2. Pick a short kebab-case loop name.
3. Copy structure from harness templates (`GOAL.template.md`, `verify.example.sh`, `loop.json.example`) or run `pnpm exec agent-loop-init` if the repo has no profile yet. To draft GOAL/verify from an idea, `pnpm exec agent-loop-prompt --out .cursor/loops/<name>` (judge writes; freeze lint + confirm). If a human will *look* at the result (homepage, mockup, screenshot-as-hero), use `GOAL.visual.template.md` — do not copy `postQualityReview` / `reviewGate` from `*-smoke` or `example-fix`.
4. Fill **GOAL.md**: goal, acceptance criteria, constraints, out of scope. Freeze when done.
5. Write **verify.sh** that exits `0` only on real success; keep it repo-local.
6. Set **loop.json** `verify` to that script. Omit `runtime` / models when `.cursor/agent-loop.repo.json` `defaults` already set them (humans: `agent-loop-setup` once). Override per loop only when this bundle differs. Optional `reviewGate`.
7. Optionally point `plugins` at portable Agent Plugins packages (including this companion’s skills dir when dogfooding the harness repo).
8. **Scaffold only** (no “run it” / “implement this”): stop after freeze. Say the bundle is ready in this chat. Do not tell them to leave for a terminal.
9. **They asked to run / implement:** you start it here. Local Shell attached, `block_until_ms` ≥ `2700000`, `notify_on_output` on `^AGENT_LOOP_DONE `. Never `block_until_ms: 0`. Never “run this in your terminal” unless they already said they are walking away.

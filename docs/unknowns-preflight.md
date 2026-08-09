---
tags:
  - documentation
  - loops
  - planning
  - agents
---
# Unknowns preflight (before freezing GOAL)

Inspired by Claude Code practice: **plan by removing unknowns before you build** —
discover how the system can fail, have a human read that plan, *then* freeze
`GOAL.md` and run the loop.

This is **not** part of the Ralph iteration. It is a human+agent step *before*
`agent-loop run`. Do not edit `GOAL.md` mid-loop to absorb new unknowns; stop,
update the spec, re-run.

## Prove in chat → freeze (Linear-style)

Design the loop interactively first (chat / plan mode): draft the finish line,
failure modes, and permissions. When the human is satisfied, **freeze** into
`GOAL.md` + `verify.sh` (+ optional `PERMISSIONS.md` from
`templates/LOOP.permissions.example.md`) and only then `agent-loop run`.

Until freeze, treat the bundle as a **draft** — edits are free. After freeze /
during a run, do not rewrite `GOAL.md` or `loop.json` acceptance in-place to
make the worker look done; stop the run, revise the draft, freeze again, re-run.
(No separate publish snapshot in the harness yet — discipline is the control.)

## When to run

- New loop with unfamiliar deps, flaky verify, or external APIs
- Perf / metric goals (know how measurement fails)
- Any goal where “done” is ambiguous until edge cases are listed

Skip for tiny, well-understood verify scripts you’ve already dogfooded.

## Checklist

1. **Finish line** — Write the shell assertion first (`verify.sh` exit `0`). If you
   cannot name it, you do not have a `/goal`-ready loop yet.
2. **Failure modes** — Ask an agent (or yourself): how can this verify lie, flake,
   or miss the real bug? List unknowns (auth, clocks, network, fixture drift).
3. **Human read** — Read the failure-mode list yourself. Do not trust a one-shot plan.
4. **Kill or accept** — Turn unknowns into constraints, fixtures, or out-of-scope.
   Accept residual risk only explicitly.
5. **Permissions** — Default-deny MCP/extra tools and writes beyond scope; name
   opt-ins (see `templates/LOOP.permissions.example.md`).
6. **Freeze** — Commit `GOAL.md` + `verify.sh` (+ `VERIFY.skill.md`). Then run.

## Relation to meta-loop

Agent Looper meta probe→fix injects `failure-context.md` *after* a probe fails.
Unknowns preflight is the *before* cousin: cheaper to discover Whisper/verify edge
cases up front than thrash iterations.

## Anti-patterns

- Freezing a vibes goal (“make it great”) with `verify: "true"`
- Discovering new requirements mid-loop and rewriting `GOAL.md` in-place
- Treating LLM “looks done” as the finish line
- Leaving ambient MCP / network / browser tools “just in case” without naming them
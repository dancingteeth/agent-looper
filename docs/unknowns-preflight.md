---
tags:
  - documentation
  - loops
  - planning
  - agents
---
# Unknowns preflight (before freeze, and after a run)

Inspired by Claude Code practice: **plan by removing unknowns before you build** —
discover how the system can fail, have a human read that plan, *then* freeze
`GOAL.md` and run the loop. After a run, the same discipline applies when you are
about to change the scoreboard: look at export packs before adding a metric.

This is **not** part of the Ralph iteration. It is a human+agent step *before*
`agent-loop run` (and *between* runs). Do not edit `GOAL.md` or `RESEARCH.md`
mid-loop to absorb new unknowns; stop, update the spec, re-run.

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
- Brownfield work in an area the author does not already hold in their head
- Any goal where “done” is ambiguous until edge cases are listed

Skip for tiny, well-understood verify scripts you’ve already dogfooded.

## Checklist

1. **Finish line** — Four parts: outcome, scoreboard (`verify.sh` exit `0`),
   permission (`maxIterations` / stagnation), budget (stop when further work is
   not worth it). Optional **golden** artifact (screenshot, fixture, baseline).
   Metric loops: revert if worse than baseline. If you cannot name the shell
   assertion, you do not have a loop yet.
2. **Wiring** — EDGE DATA (what crosses writer→checker→judge), REDUCER (`verify.sh`,
   not another model), FAILURE POLICY (retry / escalate / abort; do not hide missing
   work), HUMAN GATE (which irreversible actions need you). Delete any edge whose
   answer is only “the previous step finished.”
3. **Failure modes** — Ask an agent (or yourself): how can this verify lie, flake,
   or miss the real bug? List unknowns (auth, clocks, network, fixture drift).
   No traces yet: name 2–3 dimensions (task, persona, request type) and write one
   verify case per tuple instead of one generic check.
4. **Human read** — Read the failure-mode list yourself. Do not trust a one-shot plan.
5. **Kill or accept** — Turn unknowns into constraints, fixtures, or out-of-scope.
   Accept residual risk only explicitly.
6. **Permissions** — Default-deny MCP/extra tools and writes beyond scope; name
   opt-ins (see `templates/LOOP.permissions.example.md`).
7. **Brownfield research** (optional) — If the worker would otherwise spend the
   first iteration Grep-hunting, freeze a short map as `RESEARCH.md` beside
   GOAL.md ([`templates/RESEARCH.example.md`](../templates/RESEARCH.example.md)):
   relevant files, data flow, likely cause, how this repo tests this area. A
   **human reads it** before freeze — throw it out if it says the bug is invalid
   or names the wrong layer. The worker prompt indexes the path (Read on demand);
   do not paste the body into GOAL. This is **not** an inner
   Research→Plan→Implement graph; the Ralph node still implements until verify
   is green.
8. **Freeze** — Commit `GOAL.md` + `verify.sh` (+ `VERIFY.skill.md`, optional
   `RESEARCH.md`). `agent-loop-prompt` freeze lint rejects gameable greps in
   `verify.sh`. Then run.

## After a run: error discovery then steer

`failure-domains.ndjson` is harness telemetry (stagnation, env, HITL). It is
**not** a product-judgment taxonomy. When a complete loop is still wrong, or you
are about to add a `verify.sh` assertion / `REVIEWS.md` law from a theory, label
a **diverse sample of export packs first** (`.cursor/loop-exports/`). Criteria may
drift **between** freezes; do not edit `GOAL.md` mid-run.

Skip for smokes and verify you already trust.

1. Sample ~10 packs (mix `done` / `continue` / `waiting`; not only the last failure).
2. Note what bothered you:
   - **Actionable** — a colleague could act. Not “bad run”.
   - **User-facing** — what was wrong in the result, not an internal RCA.
   - **First upstream miss** only when several things failed.
   - **Failures-only** until modes stabilize.
3. A repeated miss becomes a **computational** check (`verify.sh`, golden, lint),
   then freeze again — not another `AGENTS.md` sentence.
4. Do not ask an agent to invent metrics from the folder before you have labeled
   a sample. Meta-review may *propose* clusters; a human accepts them.

What you inject into the next iteration is ranked: **correct raw verify output**
beats a summarized “diagnosis”; missing context beats incorrect context; noise
last. Prefer sidecar / truncated capture over an LLM rewrite of the failure.

## Relation to meta-loop

Agent Looper meta probe→fix injects `failure-context.md` *after* a probe fails.
Unknowns preflight is the *before* cousin: cheaper to discover Whisper/verify edge
cases up front than thrash iterations. Error discovery on export packs is the
*between-runs* cousin: human labels before meta-review clusters become new gates.

## Anti-patterns

- Freezing a vibes goal (“make it great”) with `verify: "true"`
- Discovering new requirements mid-loop and rewriting `GOAL.md` or `RESEARCH.md` in-place
- Treating a research map as a diagnosis to defend when verify disagrees
- Treating LLM “looks done” as the finish line
- Leaving ambient MCP / network / browser tools “just in case” without naming them
- Adding a verify grep / `REVIEWS.md` law from a one-shot theory without looking at export packs
- Handing `.cursor/loop-exports/` to an agent and treating its failure modes as the new scoreboard

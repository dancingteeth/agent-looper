---
tags:
  - documentation
  - loops
---
# Loop Review Patterns to Steal

Patterns from how mainstream Agent Looper / coding-agent frameworks handle review
gates, false-positive blockers, human-in-the-loop (HITL), and meta-loops — as of
2026. Grounded in OpenHands, VNX (Codex+Gemini), Anthropic managed Code Review,
AgentPatterns, and the "Specification as Quality Gate" paper.

The user-facing goal these serve: keep the **verifier** hard, the **reviewer**
gated, and the **human** as the closure authority — so a loop can't thrash on
irrelevant blockers or declare itself done on vibes.

## The three-layer split (the backbone)

| Layer | Role | What it is |
| ----- | ---- | ---------- |
| Verifier | deterministic "done" | tests, lint, file-size, structured-output checks. Hard gate. |
| Reviewer | LLM judgment | scoped to the structural/architectural residual specs can't capture. |
| Human | closure authority | HITL sign-off for subjective or high-stakes decisions. |

Key warning (Specification as Quality Gate, 2026): an LLM reviewing
LLM-generated code is **circular** without an external reference — both share a
training distribution and echo each other's errors. So `verify` is the real gate;
`review` rides on top; HITL owns the residual.

## Patterns

### 1. Severity / impact contract (kills irrelevant blockers)
LLM reviewers default to `error` for cosmetic findings, inflating false-blockers
by ~75% and creating an infinite fix-loop (VNX: 28 Codex runs / 14 PRs).
Fix: a one-line contract — **default `warning`; promote to `error` only on impact
criteria** (data loss, security boundary breach, false PR closure, cross-dispatch
state corruption). With it, round-2 false-blocker rate dropped sharply while real
bugs stayed `error`.

Maps to us: `reviewGate` currently gates on the `BLOCKERS` verdict. Upgrade:
require an explicit `impact` field on blockers; gate only on
`error`-with-impact, downgrade the rest to advisory.

### 2. Reproduce-before-report (independent verification)
A reviewer raises a *candidate* finding; a **fresh-context verifier** must cite
`file:line` or construct the failure before it ships. Non-reproducing findings are
dropped silently (AgentPatterns; CodeX-Verify: 32.8% → 72.4% accuracy). Load-bearing
property is **independence** — fresh context, ideally a different model family.
Same-family verifiers inherit the reviewer's confabulations.

Maps to us: the blocker re-check reduces "new irrelevant blocker" noise, but it is
the *same* model re-checking, so it does not fix same-family bias. Upgrade path:
pair the re-check with a deterministic check (does the blocker still appear in the
diff?) or a second-family reviewer.

### 3. Multi-provider to beat correlated error
Single-provider review has documented bias (a model rarely flags its own family's
code). VNX runs a Codex gate (concrete bugs) + a Gemini gate (architecture/coupling),
deterministic file gates first, LLM gates last. The data showed round-2 findings
cited *new* lines the round-1 fixes introduced — genuine iterative deepening, not
noise — but only because the severity contract was specified.

Maps to us: make the reviewer model configurable / family-diverse on `reviewGate`
instead of hardcoded to one SDK.

### 4. Human as the sole closure authority
VNX "Async Quality Gates" (T0) and OpenHands `ConfirmationPolicy`: a human (or
explicit approval state) is the only thing that declares work *done*; workers attach
evidence, the system generates findings, the human approves/holds. OpenHands
separates *policy decision* (allow / block / escalate, deterministic) from *runtime
interaction* (confirm). This is our `reviewGateHitl` task; the clean separation we
could mirror is giving blockers an explicit `impact` field that feeds the gate.

### 5. Judge-LLM for "done" (verifiable objectives)
OpenHands `/goal`: after each run a second, independent judge-LLM audits the
transcript for *evidence* (file contents, command output, test results) that the
objective is provably complete; re-prompts until done or capped. Verdent's guide
says the same thing: push as much of "done" as possible into observable checks
(tests pass, commands exit 0), keep "the code is clean" out of the automated exit
logic and at a review gate.

Maps to us: `verify` is already the hard gate; the pattern validates keeping it
that way and not letting the agent's self-assessment end the loop.

### 6. Verification-as-skill (the quality multiplier)
Claude Code team guide (2026): the highest-leverage quality move is turning your
manual "does this work?" into a **reusable, quantitative `SKILL.md`** the agent runs
end-to-end — open the page, click the control, check the console, screenshot
before/after — with the rule "if any step fails, fix and rerun; never hand back
partially verified work." The more quantitative the checks, the easier self-verify
is. Maps to us: we support a `verify` *command*; framing it as a *skill with
measurable checks* (not just "exit 0") is the upgrade that makes verification real
and reduces turns. Encode what "good" looks like once, reuse on every loop.

### 7. Model routing + pilot-before-scale (cost discipline)
Claude Code team guide: "route routines to smaller/faster models; use the most
capable model for judgment calls," and *pilot on a slice before a large run* (dynamic
workflows can spawn hundreds of agents). Maps to us: our reasoning-tier escalation is
exactly "cheap by default, escalate only when stuck" — the same principle. Practical
rule for tuning: pilot `maxReviewCycles` / `unparseableReviewRetries` on a few real
tasks before setting them broadly, rather than guessing defaults.

### 8. Proactive-loop composition = the factory blueprint
Claude Code team guide's proactive loop is the concrete architecture for the
meta-loop below: `/schedule` (collect work) + `/goal` (define done) + dynamic
workflows (explore several solutions in parallel worktrees) + a **judge that
adversarially reviews** each. That is our per-loop-stays-lightweight (fix + HITL) +
separate cross-loop reviewer design, validated. Their taxonomy also reminds us:
**start simple, use patterns selectively** — `reviewGate` off is the right path for
trivial tasks; the full gating stack is for high-stakes work.

## The meta-loop (your "10 loops' diffs → review")

Scaling to a software factory is **not** bolting more gating onto every loop. It is
a separate aggregator that consumes N loops' diffs + their `failure-domains.ndjson`
(including `meta_probe_failed` and `review_gate_hitl` reasons) and performs the
cross-loop structural review. The "Specification as Quality Gate" paper puts this
residual — drift from uncodified design, dead abstractions, half-finished migrations
— as the legitimate, bounded target for AI review, with the human loop as the final
feedback. Our HITL escalation stays a human sign-off lane; the meta-loop is the
automated cross-loop reviewer. The proactive-loop composition (pattern 8) is the
blueprint for building it.

## How to learn / validate

- **Read the code:** OpenHands `GoalCompletionLoop` (`/goal` judge) and `Critic`
  (iterative refinement below a score threshold); Claude Code `/code-review ultra`
  (multi-agent fleet + independent verification) as the production reference for
  reproduce-before-report.
- **Run your own 10-PR experiment (like VNX):** take 10 real merged PRs, run the
  loop's review gate, and measure (a) did it find the real issue, (b) did it cite
  the right line, (c) did it hallucinate a blocker. That's how the 75% false-blocker
  inflation was discovered — and the only way to know if `reviewGate` helps or
  thrashes.
- **Highest-ROI next step:** add an **impact-severity contract** to blockers in
  `reviewVerdict` (gate only on `error`-with-impact; downgrade the rest to advisory).
  It is the single change the 2026 data says most directly stops the irrelevant-
  blocker fix-loop. Full build order, acceptance criteria, and Taskwarrior mapping:
  [`loop-review-roadmap.md`](./loop-review-roadmap.md).
- **Encode misses as system improvements:** when a loop result doesn't meet
  standard, turn the fix into a reusable skill/check (pattern 6) or a
  `failure-domains` entry the meta-loop can learn from — don't just patch the one
  instance.

## Source map

- "Specification as Quality Gate" (arxiv 2603.25773) — circularity of LLM-on-LLM review.
- VNX multi-AI code review (vincentvandeth.nl, 2026) — severity contract, multi-provider gates.
- AgentPatterns "Reproduce-Before-Report Verification Gate" — independent verifier, silent drop.
- OpenHands docs: GoalCompletionLoop, Critic, SecurityAnalyzer/ConfirmationPolicy.
- Anthropic managed Code Review / `/code-review ultra` — multi-agent fleet + verification artifacts.
- Verdent "Build a Coding Agent Loop That Stops Safely" — observable contract, review gates, exit paths.
- Addy Osmani "Agentic Code Review" — agent-as-reviewer limits, evidence-based review.
- Claude Code team "Getting started with AI loops" (Delba Oliveira, 2026) — loop taxonomy, verification-as-skill, model routing, proactive-loop composition.

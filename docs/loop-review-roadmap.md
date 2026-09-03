---
tags:
  - documentation
  - loops
  - roadmap
  - agentic_ai
  - agents
---
# Loop review next-step roadmap

Concrete implementation plan for the upgrades called out in
[`loop-review-patterns.md`](./loop-review-patterns.md). Principles stay fixed:

1. **Verifier** is the hard gate (`verify` / `finalVerify`).
2. **Reviewer** is gated judgment on top (never replaces verify).
3. **Human** remains closure authority for residual / high-stakes calls (`reviewGateHitl`).

Research context and citations live in the patterns doc. This file is the
**build order, acceptance criteria, and file touch list**.

## Current baseline (already shipped)

| Capability | Where |
| --- | --- |
| Hard verify + optional final verify | `loopVerify`, `agentLoop` |
| Quality review + review-gate | `loopPostReview`, `reviewGate`, `maxReviewCycles` |
| PASS / ADVISORY / BLOCKERS parse | `reviewVerdict.ts` |
| Scoped blocker re-check (same family) | `reviewBlockerRecheck` |
| HITL on gate exhaust | `reviewGateHitl` |
| Worker / judge model split | `runtime` + `model` (worker); `reviewRuntime` + `reviewModel` (judge, default cursor) |
| Reasoning / model escalation | `reasoningEffort`, `escalateModel` |
| Failure domain logging | `failure-domains.ndjson` |
| Meta-loop inject hook | `injectFailureContext` |

Open Taskwarrior project for **Agent Looper** (slug **`agent-loop`**). Use **UUID** in docs and `loop.json`
(numeric IDs are recycled). Related consumer experiment: `loops` task
`314` / UUID from your sync (Maxin meta-loop smoke).

### Taskwarrior backlog (UUID)

| Milestone | UUID | Summary |
| --- | --- | --- |
| M1 | `8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6` | Impact-severity contract |
| M2 | `b2185d70-2889-4eed-94c2-d99949954211` | Reproduce-before-report (blocked by M1) |
| M3 | `adf66bf8-d52a-43e2-8009-756649cc32b2` | Multi-family secondary judge (shipped) |
| M4 | `fe3f4076-b997-4d28-a59a-baf720c28e5d` | Verification-as-skill |
| M5 | `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00` | Cross-loop meta-review CLI |

Other Agent Looper backlog: `17bfc1cd-bf5d-43a7-9b8b-9bf7658aaa07` (extract review-gate) — **done**,
`de4144f2-9e6a-4cf6-8943-81efc49d4c5c` (loopRisk profiles) — **shipped**,
`f3280589-70a0-463e-a472-6feccb622a70` (pricing drift check) — **shipped**,
`a774c5d7-5900-4d87-9092-dd0e8ba1cc38` (`--trust-config`) — **shipped**.

---

## Priority order

| # | Feature | ROI | Effort | Depends on |
| - | --- | --- | --- | --- |
| 1 | Impact-severity contract | Highest (stops irrelevant-blocker thrash) | M | — |
| 2 | Reproduce-before-report | High (cuts confabulated blockers) | M–L | Benefits from #1 |
| 3 | Multi-provider / multi-family review | Medium–high (bias reduction) | L | #1 useful first |
| 4 | Verification-as-skill | High for quality, orthogonal | M | — |
| 5 | Cross-loop meta-reviewer | Factory scale | L | #1–2 data shape helps |

Pilot rule (from patterns): tune `maxReviewCycles` / `unparseableReviewRetries` on a
handful of real loops before locking defaults for #1–3.

---

## 1. Impact-severity contract

### Status (2026-07-21)

**Shipped** — `8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6`:

- Structured blocker parse (`severity`, `impact`, title, detail)
- `reviewGate` blocks only `error` + recognized impact tags
- Legacy bullets default to `warning` / `none` (non-gating)
- Pilot checklist: [`experiments/review-impact-severity-pilot.md`](./experiments/review-impact-severity-pilot.md)

### Problem
Reviewers default to BLOCKERS for cosmetic findings → fix-loop thrash. Gate
today is binary on verdict `BLOCKERS`, with blockers as plain strings.

### Design
Extend blocker grammar so each item carries:

```text
- severity: error|warning   impact: <tag>   [must-fix] **Title** — detail
```

Suggested impact tags (start small, expand via REVIEWS.md):

- `data-loss`
- `security-boundary`
- `false-closure` (would mark complete when not)
- `cross-dispatch` / state corruption
- `verify-bypass` (weakens or skips the hard gate)

**Gate rule (reviewGate):**

- Treat as blocking only blockers with `severity: error` **and** a recognized
  `impact` tag.
- Everything else → advisory (loop may complete; surface in `review.md`).
- Missing severity/impact → default `warning` (fail-open toward completion,
  fail-closed only when explicitly tagged).

### Implementation sketch

| Area | Work |
| --- | --- |
| `reviewPrompt.ts` | Require severity + impact in Blockers section; document default warning |
| `reviewVerdict.ts` | Parse structured blockers (`severity`, `impact`, title, body) |
| `agentLoop.ts` | Gate on structured blockers, not raw `verdict === 'BLOCKERS'` alone |
| `review.md` consumers / Telegram | Show severity + impact |
| Tests | Parse fixtures; gate only error+impact; legacy bullet still parses as warning |

### Acceptance criteria

- [x] Parsed type includes `{ severity, impact, title, detail }` (legacy strings → warning / `impact: none`).
- [x] With `reviewGate: true`, only `error` + known impact re-enters the fix loop.
- [x] Cosmetic “docs tone” findings can be BLOCKERS prose but do not block completion when tagged warning.
- [ ] 10-loop / 10-PR experiment script or checklist documents before/after false-blocker rate (see Validation).

### Out of scope
Rewriting consumer REVIEWS.md files in other repos — ship `templates/REVIEWS.md`
(portable core from unified-code-review; not the full skill). Meta-review brief:
[`meta-review-prompt.md`](./meta-review-prompt.md).

---

## 2. Reproduce-before-report

### Status (2026-07-21)

**Phase 2a shipped** (dogfood loop `.cursor/loops/reproduce-before-report/`, TW
`b2185d70-2889-4eed-94c2-d99949954211` now tracks **2b** only):

- `reviewReproduce` loop.json flag (default `false`)
- Deterministic filter: downgrade error+impact blockers without citeable path in
  merge-base…**working tree** changed files (committed + staged + unstaged)
- Empty changed-files set → skip filter (no false-closure)
- Footer in `review.md` lists downgraded items

**Open:** phase 2c second-family.

**Phase 2b shipped** (`reviewReproduceAgent`, dogfood `.cursor/loops/reproduce-agent/`, TW
`b2185d70-2889-4eed-94c2-d99949954211`):

- Fresh Cursor `role: review` session on remaining gating blockers
- KEEP/DROP via `### Blockers` (omit = DROP); footer in `review.md`

### Problem
Same-family re-check (`reviewBlockerRecheck`) reduces *new* noise but still
shares confabulation bias with the original reviewer.

### Design (layered)

**Phase 2a — deterministic filters (cheap):**

- Require `file:line` (or path + symbol) on error-impact blockers.
- Drop blockers whose path is outside the merge-base…HEAD diff (or not in
  changed files list).
- Optional: `rg` / AST existence check for the cited symbol.

**Phase 2b — independent verify agent:**

- Fresh agent SDK session (`reviewRuntime`) with **no** prior review transcript.
- Prompt: “Reproduce only these candidate blockers; cite evidence or DROP.”
- Non-reproducing candidates dropped silently (AgentPatterns).

**Phase 2c — second family (optional, after #3):**

- Reproduce step uses a different provider/model family than the author of the
  finding.

### Implementation sketch

| Area | Work |
| --- | --- |
| Config | `reviewReproduce: boolean` (default off → on after pilot) |
| `loopPostReview.ts` | Pipeline: review → filter → optional reproduce pass → write `review.md` |
| Diff helper | Reuse merge-base diff; add path membership helper |
| Logging | Count dropped candidates in `failure-domains` / review footer |

### Acceptance criteria

- [x] Error-impact blockers without citeable path are downgraded or dropped when reproduce is on.
- [x] Paths not in the loop diff cannot alone keep the gate open.
- [x] Reproduce pass uses a fresh agent session (documented in logs). *(2b)*
- [x] Unit tests for path filter; integration mock for reproduce DROP/KEEP.

---

## 3. Multi-provider / multi-family review

### Problem
Single-provider review under-flags own-family mistakes. Worker+judge split
helps when families differ.

### Status (shipped slices)

| Slice | Status |
| --- | --- |
| Primary judge any worker runtime (`reviewRuntime`) | **Shipped** — `cursor` \| `cline-pass` \| `cline` \| `opencode` \| `pi` |
| Secondary residual judge (`reviewSecondaryRuntime`) | **Shipped** (M3) — any `reviewRuntime` |
| Meta-review multi-runtime | Out of scope (meta-review stays Cursor) |

### Design

```text
deterministic gates → primary review (reviewRuntime) → optional secondary Cline → merge
```

Merge policy (start simple):

- Union of **error+impact** blockers after each side’s severity contract.
- Advisory findings do not need consensus.
- Config: `reviewRuntime` / `reviewModel` for primary; `reviewSecondaryRuntime` /
  `reviewSecondaryModel` for optional second family.

VNX-style split (later): one gate for concrete bugs, one for
architecture/coupling — only if merge noise stays low in the pilot.

### Implementation sketch

| Area | Work |
| --- | --- |
| `loopAgentConfig` | `resolveReviewAgent` + secondary allowlist |
| `reviewAgentRun` / `loopPostReview` | Dispatch primary; merge secondary |
| Cost controls | Cap secondary to review-gate cycles only; skip on ADVISORY primary |

### Acceptance criteria

- [x] Primary judge can use any worker runtime via `reviewRuntime` (default cursor).
- [x] Can enable a second-family review without breaking Cursor-only installs
      (dynamic import / optional peer, same pattern as Cline worker).
- [x] Merge respects impact-severity contract from #1.
- [x] Documented cost: one extra judge call per review cycle when secondary enabled.

### Depends on
#1 strongly recommended first so dual review does not double cosmetic noise.

---

## 4. Verification-as-skill

### Status (2026-07-21)

**Track A shipped** — templates + docs + init scaffold (`fe3f4076-b997-4d28-a59a-baf720c28e5d`):

- [`docs/verification-as-skill.md`](./verification-as-skill.md)
- `templates/VERIFY.skill.md`, `templates/verify.example.sh`
- `agent-loop-init` copies `verify.sh` + `VERIFY.skill.md` into example loop
- GOAL preflight warns when measurable verify artifacts are not referenced

**Track B shipped** — optional `verifyMode: 'command' | 'skill'` in harness (default `command`).

### Problem
`verify` is “exit 0”. Highest leverage quality move is a reusable,
quantitative checklist the agent (or shell harness) runs end-to-end.

### Design

- Support `verifySkill` (path to `SKILL.md` or skill name) **or** keep `verify`
  as shell while documenting skill-shaped verify scripts in templates.
- Skill body: numbered measurable checks (“open X”, “assert Y in stdout”,
  “screenshot optional”). Rule: fail → fix → rerun; never hand back partial.

Two delivery tracks (pick one first):

| Track | Pros |
| --- | --- |
| **A. Template + docs** | Fast; consumers write `scripts/verify-*.sh` + SKILL that wraps it |
| **B. Harness runs skill** | Agent-loop invokes Cursor/Cline with the skill as the verify phase |

Recommend **A then B**: ship `templates/VERIFY.skill.md` + example shell, then
optional `verifyMode: 'command' | 'skill'`.

### Acceptance criteria

- [x] Template skill with measurable steps and “no partial handoff” rule.
- [x] In-repo example via `agent-loop-init` (`verify.sh` + `loop.json` wiring).
- [x] Docs: prefer quantitative verify over “looks good” in GOAL.md preflight tips.
- [x] Track B: optional `verifyMode` harness.

### Orthogonal
Can ship in parallel with #1–3.

---

## 5. Cross-loop meta-reviewer

### Problem
Per-loop gates do not catch drift across many loops (dead abstractions,
half-finished migrations). Scaling is a **separate aggregator**, not more
gating on every loop.

### Design

Input (per loop dir under `.cursor/loops/` or batch):

- Diffs / `log.ndjson`
- `failure-domains.ndjson` (`meta_probe_failed`, `review_gate_hitl`, …)
- Latest `review.md*`

Output:

- Cross-loop structural report + optional HITL queue
- Does **not** auto-close individual loops

Blueprint: schedule/collect → define done → optional parallel worktrees →
adversarial judge (patterns doc §8). Consumer spike already tracked as
`loops` #314 (Maxin smoke).

### Implementation sketch

| Area | Work |
| --- | --- |
| CLI | `agent-loop-meta-review <batch-or-glob>` |
| Config | `loop-batch.json` / meta profile |
| Prompt | Bounded residual only — see [`meta-review-prompt.md`](./meta-review-prompt.md) |
| HITL | Optional checkpoints for human closure (`hitlProvider` — Taskwarrior, file, GitHub, Linear, command, …) |

### Acceptance criteria

- [x] Reads N completed loop artifacts without re-running implement workers.
- [x] Emits a single report + optional HITL follow-ups (`--hitl`).
- [x] Explicitly does not flip per-loop `complete` flags.

### Depends on
Richer blocker schema (#1) and failure-domain hygiene make the meta-prompt
much better; not a hard code dependency.

---

## Validation experiment (shared)

Before declaring #1–3 “done”, run a small offline experiment (patterns doc):

1. Pick ~10 real merged PRs or finished loops.
2. Run review-gate (with/without new flags).
3. Score: (a) found real issue, (b) correct line, (c) hallucinated blocker.
4. Record false-blocker rate before/after impact contract and reproduce filter.

Store results under `docs/experiments/` (date-stamped) or a short note in the
PR that lands #1.

---

## Suggested milestones

| Milestone | Ships | Exit |
| --- | --- | --- |
| **M1** | Impact-severity parse + gate | Pilot experiment shows lower false-blocker rate |
| **M2** | Deterministic reproduce filters (+ optional fresh-context reproduce) | Error blockers require citeable evidence |
| **M3** | Optional second-family judge | Cursor-only still default; secondary opt-in |
| **M4** | Verify skill template (+ optional harness mode) | Track A done; consumer adopts `verify.sh`; Track B optional |
| **M5** | Meta-review CLI | Batch report over N loops without re-implement |
| **M6** | Competitive P0 (docs/templates) | Positioning, prompt-diet, unknowns preflight, metric-grind template, `llms.txt` |
| **M7** | Intervention + Guide packets | **Shipped** — Proceed/Guide/Deny/Confirm; Guide packets; `status` done\|continue\|waiting; trivial-verify warn |
| **M8** | Batch rubrics / Auto model (optional) | **Shipped** — batch `{path,rubric}`; computer-use templates; Auto **blocked** pending SDK (`docs/cursor-auto-router.md`) |
| **M9** | Linear Loops governance steals | **Shipped (docs/templates)** — prove→freeze, draft discipline, run-report as audit surface, `LOOP.permissions.example.md`, tool default-deny. No harness publish-snapshot yet |
| **M10** | Lunar graph scoreboard | **0.4.5** — docs (edge sentences + GOAL/preflight spec fields) + `run-report.md` report card (phase time, kill rate, retries, HITL, writer vs referee $). Hung-worker escalate + `check-running-loops` skill ship in the same patch |

### M6–M8 context (2026-07 competitive session)

Industry converged on goal + loop + judge (Claude Code `/goal`, Mastra Factory/Goals,
Kilo self-test, Strands steering, Cursor Router). Agent Looper’s **non-negotiable wedge**:
shell exit `0` + fresh context per iteration — not LLM-as-sole-exit, not thread memory,
not issue→prod factory UI.

Steal map and priorities: session canvas `session-steal-decisions` (local planning notes stay gitignored).

### M9 context (2026-08 Linear Loops)

Linear Loops ([docs](https://linear.app/docs/loops)) is team-ops automation with audit-first
UX (draft→publish, run history, permission matrix). Adopt governance patterns only;
do not adopt LLM-as-exit or issue-graph scope. Details in backlog **P3** —
docs/templates shipped; optional publish-snapshot harness deferred.

### M10 context (2026-08 Lunar graph guide)

Lunar’s [Graph Engineering guide](https://x.com/LunarResearcher/status/2086071302272528833)
is dependency vs order, typed edge payloads, a width budget, a code reducer, an
adversarial verifier, failure domains, human approval as an edge, and graph
metrics. The Ralph node + shell verify + `reviewGate` already *are* that graph.
M10 makes the edges and the scoreboard visible. Do not market “graph
engineering”; market a report card after the run. **Shipped in 0.4.5** with
hung-worker escalate and the `check-running-loops` skill. Details in backlog **P9**.

## Non-goals

- Replacing `verify` with LLM self-assessment.
- Auto-merging or auto-closing work without human policy when HITL is configured.
- Enabling full gate stack by default on trivial loops (`reviewGate` stays opt-in).
- Climbing to a GitHub/Linear/Slack “software factory” product (stay the harness factories compose).
- Accumulating conversation managers / same-session self-exit as the product spine.

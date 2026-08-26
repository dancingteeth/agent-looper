---
tags:
  - architecture
  - deep-dive
  - agents
  - documentation
---
# Agent Looper (`@dancingteeth/agent-looper`) — Technical Architecture

> **Audience:** technical reviewers, integrators, and anyone who needs to understand how
> the loop harness works under the hood. This document complements the README;
> it assumes you've read that first.

---

## 1. Philosophy & Design Principles

The harness implements Geoffrey Huntley's [Ralph loop](https://ghuntley.com/loop/) pattern
with these invariants:

1. **Fresh context per iteration.** Every agent run starts from a clean session — no
   carryover of conversation history, tool results, or in-memory state. Progress lives in
   **files and git**, not in the context window.
2. **Shell backpressure is the only truth.** A deterministic shell command (`verify`,
   optionally `finalVerify`) decides whether the loop is done. Exit code 0 = success.
3. **The loop is monolithic.** One repo, one process, one task per loop. No multi-agent
   mesh, no parallel branches inside one loop.
4. **Failure is observable.** Every iteration leaves a structured log line in
   `log.ndjson`. Stagnation, model exhaustion, and review-gate failures are written to
   `failure-domains.ndjson`.
5. **Human-in-the-loop (HITL) is optional but built-in.** Checkpoints, pause modes, and
   notify fallbacks let a human watch, gate, or intervene without breaking the loop
   contract (providers and triggers: [`docs/hitl-providers.md`](./docs/hitl-providers.md)).

### 1.1 Shape: a small graph, a loop inside one node

“Graph engineering” in 2026 names two different objects. This harness is the
**control-flow** one: who runs, who checks, what may reopen the job. It is **not** a
knowledge graph (no entity store, no GraphRAG) and **not** a multi-agent mesh inside
one iteration (invariant 3).

The Ralph loop lives **inside the worker node**. Around it the harness is already a
small directed graph:

| Node | Job | Why it is a separate node |
| --- | --- | --- |
| **Worker** | Implement toward frozen `GOAL.md` | Fresh session every visit — context rot stays in one node |
| **Verify** | Shell `verify` / `finalVerify`, exit `0` | Deterministic edge. Models do not mark their own exam |
| **Judge** | Residual `review.md` after green verify | Athlete ≠ referee. Optional `reviewGate` is the only edge back to the worker |
| **Human** | HITL when the gate is stuck | Slow path; not a fourth LLM |

Edges carry **files and git**, not chat stew: prior verifier output, Guide packets,
`review.md`, `log.ndjson`. Frozen `GOAL.md` + `verify.sh` + permissions are the
slow-changing **role graph** (who may finish, who may reopen). Iteration order is the
**work graph** (retries allowed; rewriting the finish line is not).

Fan-out is `agent-loop-batch` / meta-review — a sequence of loops, not nested
orchestrator-workers inside one `GOAL.md`.

---

## 2. High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        agent-loop run                           │
│                                                                 │
│  ┌─────────┐   ┌──────────────┐   ┌───────────┐   ┌─────────┐ │
│  │ GOAL.md │──▶│ Prompt build │──▶│ Agent SDK │──▶│ Verify  │ │
│  │ loop.json│   │ (per iter)   │   │           │   │ shell   │ │
│  │ git snap│   │              │   │           │   │ cmd     │ │
│  │ prior   │   │              │   │           │   │         │ │
│  │ failures│   │              │   │           │   │         │ │
│  └─────────┘   └──────────────┘   └───────────┘   └────┬────┘ │
│                                                         │      │
│                    ┌────────────────────────────────────┘      │
│                    ▼                                            │
│              exit 0?                                            │
│              ├── yes ──▶ review gate ──▶ success ──▶ HITL+sync │
│              └── no  ──▶ log + next iteration (or abort)       │
│                                                                 │
│  Each iteration writes one JSON line to log.ndjson             │
│  On finish: run-report.md (+ optional transcript.ndjson)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Entry Points (CLI Binaries)

| Binary | Source | Purpose |
|--------|--------|---------|
| `agent-loop` | `src/cli/run.ts` | Run a single loop bundle |
| `agent-loop-batch` | `src/cli/run-batch.ts` | Run `loop-batch.json` (sequential or meta) |
| `agent-check` | `src/cli/check.ts` | SDK + API key smoke test |
| `agent-loop-init` | `src/cli/init.ts` | Scaffold repo profile + example loop + templates |
| `agent-loop-review-run` | `src/cli/review-run.ts` | Standalone review (writes `review.md`) |
| `agent-loop-review-preview` | `src/cli/review-preview.ts` | Dry-run review prompt to stdout |
| `agent-loop-doctor` | `src/cli/doctor.ts` | Validate `dist/` + `file:` checkout (postinstall) |
| `agent-loop-export-run` | `src/cli/export-run.ts` | Regenerate `run-report.md` from bundle artifacts |

All CLIs consume `resolveRepoContext()` from `src/context/repoContext.ts`, which resolves
`process.cwd()` (or an explicit `--repo-root`) and loads the repo profile from
`.cursor/agent-loop.repo.json`.

### CLI Argument Flow (single loop)

```
process.argv
  → parseVerboseFlag (--verbose / -v / AGENT_LOOP_VERBOSE env)
  → parseRepoRootFlag (--repo-root <path>)
  → parse positionals: <loop-dir>, --max-iterations, --model, --mode, …
  → merge CLI overrides into loop.json config via mergeLoopConfig()
  → resolveRepoContext → loadLoopBundle → warnShellCommandsFromConfig
  → runAgentLoop()
```

---

## 4. Core Loop Engine (`src/loop/agentLoop.ts`)

### 4.1 `runAgentLoop()`

This is the heart of the system. Signature:

```ts
runAgentLoop(options: {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  onIterationStart?: (iteration: number) => void
}): Promise<AgentLoopResult>
```

### 4.2 Iteration Lifecycle

For each iteration `i` (1 to `maxIterations`):

**Step 1 — Git snapshot:** `captureGitWorkspaceSnapshot(repoRoot)` captures branch,
shortSha, diffStat, and statusPorcelain before the agent runs.

**Step 2 — Agent session:** Created once at loop start via `createLoopAgentSession()`.
Cursor runs are stateless wrappers; ClinePass uses one `ClineCore` instance across all
iterations, creating a new Cline session per iteration via `cline.start()`.

**Step 3 — Prompt construction:** `buildAgentLoopPrompt()` assembles the iteration
prompt from frozen GOAL.md, current git snapshot, prior verifier failures (injected
verbatim — not diagnosed), last verifier result, stagnation warnings, reverse-mode
guidance, failure context from meta-loop probes, review blockers, skill indexes, and
an optional frozen `RESEARCH.md` index. Incorrect injected context is worse than
missing; missing is worse than noise. The prompt is ordered **stable head → volatile
tail**: the intro, goal, skills, research, mode, and `## Rules` section are emitted
first and are byte-identical across iterations, while the git snapshot, verifier
results, failures, stagnation, review blockers, failure context, and the iteration
counter are appended last. This keeps the prompt prefix unchanged so the provider
**prefix-cache** is reused on iterations 2..N (cached input tokens are billed at a
discount).

GOAL / skills / `RESEARCH.md` are inferential **guides** (feedforward). `verify.sh`
is the computational **sensor**. `reviewGate` is inferential feedback. When a
failure repeats, strengthen the sensor, not the prompt.

**Step 4 — Reasoning + model escalation:** `resolveIterationAgent(config, iteration, repeatCount)`
(Cline and Pi) climbs the **cheap lever first**. The reasoning tier starts at `reasoningEffort`
and steps up by `reasoningEscalationStep` tiers each iteration (from iteration 2) until it hits
the `escalateReasoningEffort` ceiling — so e.g. flash runs `medium → high → xhigh` across
iterations. The **expensive lever** (model switch to `escalateModel`, default `qwen3.7-plus`) only
fires once reasoning has reached its ceiling **and** identical-failure stagnation persists past
`escalateAfterStagnation` (default 2). On switch, the escalated model uses
`escalateModelReasoningEffort` (its own tier) or the ceiling tier. Reasoning is driven by
iteration count, not by identical-failure signature, so it climbs reliably even when cranking
effort changes the agent's approach. Cursor loops are pinned to `composer-2.5` and ignore
`reasoningEffort`.

**Step 5 — Agent run:** The prompt is sent to the configured agent SDK (`runtime` /
`reviewRuntime`). Token and cost reporting vary by provider (e.g. ClinePass via
`getAccumulatedUsage()`; Cursor may not expose per-run token data).

**Step 6 — Inner agent status:** `resolveInnerAgentStatus(text, runtime)` detects
provider-specific inner-loop exhaustion (e.g. Cline’s session iteration cap). When
that fires, the outer harness continues — the verifier is still the final judge.

**Step 7 — Verifier:** `runVerifyCommand()` runs via `spawnSync` with `shell: true`.
When `verifyMode` is `skill`, a one-shot verify agent runs first with the **same**
`resolveIterationAgent` as the worker (reasoning ladder and `escalateModel` apply).
Exit code 0 = pass. Output truncated at 64KB.

**Step 8 — On failure:** Append iteration log to `log.ndjson`, run
`detectStagnation()` on last N failures. If stagnant: log failure domain, abort.
Otherwise: loop.

**Step 9 — On success:** Run `finalVerify` (if configured), then decide whether to run
`postQualityReview`:

- `true` / `false` — always run or skip the judge.
- `"auto"` (default) — infer risk from `GOAL.md` + `verify` via merged keyword profiles
  (`src/loop/loopRiskProfile.ts`): harness defaults → `REVIEWS.md` `## Loop risk inference`
  → `agent-loop.repo.json` `loopRiskProfile` → per-loop `loopRiskProfile`. Run review when
  inferred tier is not `low`. Set `reviewRisk` in `loop.json` to skip inference.
- `reviewGate: true` always runs review regardless of `postQualityReview` / risk.

If review runs: check review gate. If gate blocks: inject blockers into next prompt,
restart (up to `maxReviewCycles`). Otherwise: success. Preview: `agent-loop-review-preview`.

**Step 10 — Success cleanup:** Optional linked-task completion (e.g. Taskwarrior
`done`), HITL checkpoint via `hitlProvider`, then `syncCommand`.

**Step 10b — Run report (default on):** When `exportRunReport` is true, write
`run-report.md` (human timeline: models, verify, session IDs, tool counts, review summary).
When `exportTranscript` is true, append worker tool events to `transcript.ndjson` and enrich
`log.ndjson` per iteration. Regenerate later with `agent-loop-export-run`.

**Step 11 — Failure exits:** Max iterations, stagnation, or agent SDK error — each
aborts and logs a failure domain.

### 4.3 Session Lifecycle

```ts
const agentSession = await createLoopAgentSession(config, ctx)
try { /* all iterations */ }
finally { await agentSession.dispose() }
```
ClinePass dispose calls `cline.dispose()`; Cursor is a no-op.

---


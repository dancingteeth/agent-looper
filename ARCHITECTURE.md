---
tags:
  - architecture
  - deep-dive
  - agents
  - documentation
---
# @dancingteeth/agent-loop — Technical Architecture

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
5. **Human-in-the-loop (HITL) is optional but built-in.** Taskwarrior integration and
   `--pause-after-iteration` let a human watch, gate, or intervene without breaking the
   loop contract.

---

## 2. High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        agent-loop run                           │
│                                                                 │
│  ┌─────────┐   ┌──────────────┐   ┌───────────┐   ┌─────────┐ │
│  │ GOAL.md │──▶│ Prompt build │──▶│ Agent SDK │──▶│ Verify  │ │
│  │ loop.json│   │ (per iter)   │   │ (cursor/  │   │ shell   │ │
│  │ git snap│   │              │   │  cline)   │   │ cmd     │ │
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
verbatim), last verifier result, stagnation warnings, reverse-mode guidance, failure
context from meta-loop probes, review blockers, and inlined skill runbooks. The prompt is
ordered **stable head → volatile tail**: the intro, goal, skills, mode, and `## Rules`
section are emitted first and are byte-identical across iterations, while the git snapshot,
verifier results, failures, stagnation, review blockers, failure context, and the iteration
counter are appended last. This keeps the prompt prefix unchanged so the provider
**prefix-cache** is reused on iterations 2..N (cached input tokens are billed at a discount).

**Step 4 — Reasoning + model escalation:** `resolveIterationAgent(config, iteration, repeatCount)`
(ClinePass only) climbs the **cheap lever first**. The reasoning tier starts at `reasoningEffort`
and steps up by `reasoningEscalationStep` tiers each iteration (from iteration 2) until it hits
the `escalateReasoningEffort` ceiling — so e.g. flash runs `medium → high → xhigh` across
iterations. The **expensive lever** (model switch to `escalateModel`, default `qwen3.7-plus`) only
fires once reasoning has reached its ceiling **and** identical-failure stagnation persists past
`escalateAfterStagnation` (default 2). On switch, the escalated model uses
`escalateModelReasoningEffort` (its own tier) or the ceiling tier. Reasoning is driven by
iteration count, not by identical-failure signature, so it climbs reliably even when cranking
effort changes the agent's approach. Cursor loops are pinned to `composer-2.5` and ignore
`reasoningEffort`.

**Step 5 — Agent run:** The prompt is sent to the agent SDK. ClinePass reports token
usage via `getAccumulatedUsage()`; Cursor SDK does not expose per-run token data yet.

**Step 6 — Inner agent status:** `resolveInnerAgentStatus(text, runtime)` detects
whether the inner Cline session hit its 25-iteration cap. When it does, the outer loop
continues — the verifier is the final judge.

**Step 7 — Verifier:** `runVerifyCommand()` runs via `spawnSync` with `shell: true`.
Exit code 0 = pass. Output truncated at 64KB.

**Step 8 — On failure:** Append iteration log to `log.ndjson`, run
`detectStagnation()` on last N failures. If stagnant: log failure domain, abort.
Otherwise: loop.

**Step 9 — On success:** Run `finalVerify` (if configured), run `postQualityReview`
(if enabled), check review gate. If gate blocks: inject blockers into next prompt,
restart (up to `maxReviewCycles`). Otherwise: success.

**Step 10 — Success cleanup:** Mark TW task done, create HITL task, run `syncCommand`.

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


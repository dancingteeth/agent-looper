---
tags:
  - documentation
  - agents
---
# Embed API

This is the contract for embedding `@dancingteeth/agent-looper` as a library dependency inside
another agentic development environment (ADE) — a fleet UI (Spotify's Xirp-class tooling), a
Warp-style factory, or an internal wrapper that owns worktrees and hosting. It names which
exports an ADE may depend on, which are safe to store verbatim (Portal-storable), which are
still moving, and what a major version bump is allowed to change. It is a pitch artifact and a
promise, not an architecture diagram — read `ARCHITECTURE.md` for the control-flow graph.

## Supported surface (stable vs experimental)

An ADE that only calls the `Stable` rows below survives a minor/patch bump untouched. Everything
here is exported from `src/index.ts` — there is no second, thinner entry point yet (see
[Public API and what breaks a major](#public-api-and-what-breaks-a-major)).

| Export | Kind | Stability | What it's for |
| --- | --- | --- | --- |
| `runAgentLoop` | function | Stable | Runs one loop bundle to completion; the embed wedge |
| `AgentLoopOptions` | type | Stable | Input to `runAgentLoop` (ctx, bundle, `onPhase`, runtime overrides) |
| `AgentLoopResult` | type | Stable | Return value of `runAgentLoop`; see [Loop result](#loop-result) |
| `AgentLoopPhaseEvent` | type | Experimental | Payload delivered to `onPhase`; see [Phase events](#phase-events) |
| `LoopIterationLog` | type | Experimental | Per-iteration record written to `log.ndjson`; growing shape |
| `LoopRunStatus` | type | Stable | `'done' \| 'continue' \| 'waiting'`, the HITL-aware view of a result |
| `deriveLoopRunStatus` | function | Stable | Derives `LoopRunStatus` from `complete` + `reviewEscalatedToHitl` |
| `loadLoopBundle` | function | Stable | Reads `loop.json` + `GOAL.md` + `verify.sh` off disk into a `LoadedLoopBundle` |
| `LoopConfig` | type | Stable | Parsed, defaulted `loop.json` shape `runAgentLoop` expects (`LoadedLoopBundle.config`) |
| `resolveRepoContext` | function | Stable | Resolves the repo root and repo profile a loop run should use |
| `RepoContext` | type | Stable | Return value of `resolveRepoContext`: `{ repoRoot, profile }` |
| `runVerifyCommand` | function | Stable | Runs the shell `verify` (or `finalVerify`) command; the hard gate |
| `VerifyResult` | type | Stable | Exit code, stdout/stderr, timing from `runVerifyCommand` |
| `buildRunReportMarkdown` | function | Stable | Renders `run-report.md`; see [Run-report header](#run-report-header) |

`AgentLoopPhaseEvent` is marked Experimental because it does not yet carry a `schemaVersion`
field — a host that stores raw phase events across releases should expect field additions, not
removals, until that lands. `LoopIterationLog` is Experimental for the same reason: it accrues
optional fields (`workerSession`, `toolSummary`, `durationsMs`, …) as loop internals grow.

## Frozen event shapes

These are the three shapes an ADE can persist into its own storage (a Portal, a fleet dashboard
row, a run-history table) without re-deriving them from logs. They are documented field-by-field
here because a partial list is worse than none — a host that drops an unknown field silently
loses data.

### Loop result

`AgentLoopResult` (`src/loop/agentLoop.ts`) is the return value of `runAgentLoop`. Seven fields
are always present; four are optional and only appear when the corresponding path fired.

| Field | Always present | Meaning |
| --- | --- | --- |
| `complete` | yes | Legacy boolean: verify (+ optional review) succeeded |
| `status` | yes | `LoopRunStatus` — prefer this for HITL-aware consumers |
| `iterations` | yes | Iteration count the run actually used |
| `completionReason` | yes | Human-readable reason the loop stopped |
| `lastVerify` | yes | Last `VerifyResult`, or `null` if no iteration ran verify |
| `logPath` | yes | Path to `log.ndjson` for this bundle |
| `usage` | yes | `LoopUsageSummary` — cumulative cost across iterations |
| `reviewAdvisoryBlockers` | no | `true` when review returned BLOCKERS but `reviewGate` was off |
| `innerAgentIncomplete` | no | `true` when the last iteration's inner agent did not finish cleanly |
| `hitlCheckTaskUuid` | no | Taskwarrior UUID when `hitlCheck` created a manual validation task |
| `reviewEscalatedToHitl` | no | `true` when the review gate exhausted retries and escalated to a human |

`status` is derived from `complete` and `reviewEscalatedToHitl` by `deriveLoopRunStatus` — store
`status`, not `complete`, if you want the waiting-on-human state.

### Phase events

`AgentLoopPhaseEvent` (`src/loop/agentLoop.ts`) is delivered to `AgentLoopOptions.onPhase`, once
per phase transition, via the internal `emitPhase` helper. A host subscribes by passing an
`onPhase` callback into `AgentLoopOptions` when calling `runAgentLoop`.

| Field | Always present | Meaning |
| --- | --- | --- |
| `phase` | yes | One of `GOAL`, `WORKER`, `VERIFY`, `JUDGE` |
| `iteration` | yes | Current iteration number (1-based) |
| `maxIterations` | yes | The bundle's configured iteration ceiling |
| `costUsd` | yes | Cumulative budget figure (`usageSummary.totalCostUsd`): provider invoice when it is above `$0`, otherwise the list-price estimate — the number `maxCostUsd` gates against |
| `listCostUsd` | no | Cumulative list price (`usageSummary.totalListCostUsd`), present when at least one record has a list figure |
| `billedCostUsd` | no | Cumulative provider invoice (`usageSummary.totalBilledCostUsd`; may be `$0` on hosted-free tiers) |

The four phase values map to the loop's control-flow graph: `GOAL` (preflight / prompt build),
`WORKER` (the agent SDK session that edits the repo), `VERIFY` (the shell gate), `JUDGE` (the
post-success LLM review, when configured). A fleet UI can drive a per-run progress bar off
`phase` + `iteration` / `maxIterations` alone, without parsing `log.ndjson`.

### Run-report header

`buildRunReportMarkdown` (`src/loop/loopRunReport.ts`) renders `run-report.md`
(`RUN_REPORT_FILENAME`) after every run. Before the scoreboard table it always emits four
labeled lines a host can parse without touching the rest of the markdown:

| Label | Meaning |
| --- | --- |
| `**Bundle:**` | Relative path to the loop bundle directory |
| `**Outcome:**` | `complete` or `incomplete`, plus the iteration count |
| `**Reason:**` | `completionReason` from the `AgentLoopResult` |
| `**Usage:**` | One-line cost/usage summary |

These four labels are a stable parse target even when the scoreboard table below them changes
shape — grep for `**Bundle:**` / `**Outcome:**` / `**Reason:**` / `**Usage:**` rather than parsing
the whole file.

## Public API and what breaks a major

Current package version: **0.5.0**. Until 1.0, minor bumps may still add fields to `Stable`
types (additive, non-breaking for a host that ignores unknown fields) — a major bump is reserved
for anything that removes or renames a field, changes a field's type, or removes an export from
the [Supported surface](#supported-surface-stable-vs-experimental) table above.

Concretely, a major bump is required to:

- Remove or rename any field of `AgentLoopResult`, or change one from optional to required (or
  the reverse) in a way that breaks existing readers.
- Remove or rename a `Stable` export from `src/index.ts` (`runAgentLoop`, `loadLoopBundle`,
  `runVerifyCommand`, and the rest of the Stable rows above).
- Change the meaning of an existing `Bundle` / `Outcome` / `Reason` / `Usage` header label in
  `buildRunReportMarkdown`'s output, or drop one.

A major bump is **not** required for changes confined to `Experimental` surface —
`AgentLoopPhaseEvent` and `LoopIterationLog` may gain, rename, or drop fields on a minor release
until they graduate to Stable (tracked separately as the versioned `schemaVersion` work). Adding
a new optional field to a `Stable` type, or adding a wholly new export, is also not a major-bump
trigger.

## How ADEs compose

The split is deliberate: an ADE owns the parts that differ per host, we own the parts that must
stay deterministic regardless of host.

| Owned by the ADE | Owned by this package |
| --- | --- |
| Fleet UI, run queue, multi-repo dashboard | One loop bundle's `runAgentLoop` call |
| Worktree lifecycle (create, park, clean up) | `resolveRepoContext` resolves the repo root and repo profile for the path it's given |
| Hosting / sandboxing the worker process | The worker SDK session inside one iteration |
| Fanning many repos/bundles out in parallel | `worker` → `verify` → `judge` inside one bundle |
| Persisting `AgentLoopResult` / phase events long-term (a Portal, a run-history table) | Emitting them once per run / per phase transition |

An ADE calls `loadLoopBundle` to parse a bundle off disk, then `runAgentLoop({ ctx, bundle,
onPhase })` per repo/worktree it manages, listening to `onPhase` for live progress and reading
the resolved `AgentLoopResult` when the promise settles. The package never touches fleet
scheduling, container lifecycle, or cross-repo orchestration — it runs the worker → verify →
judge sequence for exactly one bundle and returns.

## Bill of materials (hard to rewrite)

These are the edge cases an ADE would otherwise have to rediscover the hard way if it wrote its
own harness instead of depending on this one. Each row names the failure mode, not just the file.

| Edge case | Canonical module | What went wrong before this existed |
| --- | --- | --- |
| Verify-script lint | `src/loop/verifyScriptLint.ts` | A `verify.sh` with a title-cased `A\|B\|C` OR, or a single-line quoted-string extractor, can print a scoreboard that reads "OK" even when zero real checks ran — the lint rejects both patterns before the loop trusts a green exit. |
| Stagnation detection | `src/loop/loopStagnation.ts` | Without repeat-output detection a worker can burn the full iteration budget re-emitting the identical failing diff; stagnation compares consecutive iteration output and trips an escalate threshold instead of running to `maxIterations`. |
| Guide packets | `src/review/guidePackets.ts` | Feeding a judge's raw blocker prose back into the next worker prompt re-litigates the same finding in different words each round; guide packets normalize a blocker into a structured brief the next worker can act on directly. |
| Impact gating | `src/review/reviewVerdict.ts` | A judge that gates on every `error`-severity nit blocks merges on cosmetic findings; `BLOCKER_IMPACT_TAGS` restricts gating to a fixed set of impact tags (`data-loss`, `security-boundary`, `false-closure`, `cross-dispatch`, `verify-bypass`) so only real regressions stop the loop. |
| Failure domains | `src/loop/loopFailureDomain.ts` | Treating every non-zero exit as "the worker failed" hides cases where the verifier itself is broken or timed out; failure-domain classification writes worker-fault vs verifier-fault (including a dedicated hung-worker reason string) to `failure-domains.ndjson` so postmortems don't misattribute blame. |
| Hung-worker escalate | `src/loop/agentLoop.ts` | A worker SDK session that times out looks identical to a verify failure if you only watch the shell exit code; `shouldEscalateAfterWorkerFault` recognizes the timeout, does not count it as a verifier failure, and swaps to `escalateModel` instead of retrying the same model into the same wall. |
| Cost fold | `src/usage/loopUsage.ts` | List price and what a provider actually bills (hosted-free tiers, promotional credits) diverge, so summing list price alone overstates spend; `MODEL_PRICING_PER_MILLION` keeps both figures and `nextCallFitsBudget` gates the next call against the real budget, not the sticker price. |

## Security and semver posture

Supported version line, reporting channel, and response targets live in `SECURITY.md` — this
section only states the rule this package follows: `Stable` exports and the three
[frozen event shapes](#frozen-event-shapes) only change in a backward-incompatible way on a
major version bump, per [Public API and what breaks a major](#public-api-and-what-breaks-a-major)
above. `Experimental` surface (`AgentLoopPhaseEvent`, `LoopIterationLog`) is exempt from that
rule until it graduates to Stable. See `SECURITY.md` for how to report a vulnerability and what
response times to expect.

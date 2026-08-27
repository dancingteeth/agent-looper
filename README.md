---
tags:
  - documentation
  - agents
---
# Agent Looper (`@dancingteeth/agent-looper`)

**If you already loop in Cursor:** you start Composer, it says done, CI is still red, you paste the log, you open a new chat. You are the verify step.

This package is that loop without you in the middle. Fresh Cursor worker each round. A `verify.sh` you already trust. Stop when it exits 0.

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
export CURSOR_API_KEY=…   # or doppler run -- …

pnpm exec agent-loop-init
# edit GOAL.md
# put the check you keep re-running in verify.sh

pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor
```

Other workers, judges, and flags are below. You do not need them for a first green run.

How the loop is shaped: [`README.intro.md`](./README.intro.md). Technical deep dive: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (including §1.1 — the harness is a small control-flow graph; the Ralph loop lives inside the worker node). npm releases: [`docs/releasing.md`](./docs/releasing.md).

Supports pluggable **agent SDK** workers (`runtime`) and judges (`reviewRuntime`). Shipped today: **Cursor**, **Cline** (Pass / Credits), **OpenCode** (Go + BYOK), **Pi**, **Codex**, **DSH** (PATH `dsh`). Defaults and cost notes: [`docs/runtime-map.md`](./docs/runtime-map.md). DSH companion for `dsh web` (skills + scaffold, not a second harness): [`docs/dsh-plugin.md`](./docs/dsh-plugin.md). To measure cheap-worker claims on a frozen loop: [`docs/runtime-cost-bench.md`](./docs/runtime-cost-bench.md). The primary judge defaults to Cursor (`reviewRuntime` unset) but can use any worker runtime via `reviewRuntime` + `reviewModel`.

## Features at a glance

| Layer | What it does | Blocks completion? |
| --- | --- | --- |
| **Worker** | Fresh agent SDK session each iteration (`runtime`); implements toward `GOAL.md` | — (does the work) |
| **Verifier** | Shell `verify` / `finalVerify` (exit `0`). Optional `verifyMode: skill` runs a verify agent first (`VERIFY_RESULT: PASS/FAIL`), then shell. | **Yes** — hard gate |
| **Review** | Post-success LLM quality review → `review.md` (primary judge via `reviewRuntime`, default cursor). Optional `reviewGate` re-opens the fix loop on **gating** findings only. | Only with `reviewGate: true` |
| **Human** | HITL checkpoints (`hitlProvider`), `reviewGateHitl` / `hitlCheck` / `hitlOnFailure`, completion notify (Telegram / webhook / `notifyCommand` / PR comment) | Closure / alerts |

**Review stack** (opt-in unless noted):

1. **Impact-severity** — only `severity: error` + recognized `impact` tags gate (`data-loss`, `security-boundary`, `false-closure`, `cross-dispatch`, `verify-bypass`). Cosmetic findings stay advisory.
2. **Reproduce-before-report** — `reviewReproduce`: drop error+impact blockers without a citeable path in the changed-files set.
3. **Fresh reproduce agent** — `reviewReproduceAgent`: second judge session KEEP/DROP on remaining gating blockers (same `reviewRuntime` as primary).
4. **Secondary judge** — `reviewSecondaryRuntime` (any worker/judge runtime): union gating blockers with primary; skips when primary is PASS/ADVISORY with zero gates.

**Factory scale:** `agent-loop-batch` (sequential + meta-loop probe→fix), `agent-loop-meta-review` (read-only cross-loop report over N bundles).

**Ops:** stagnation detection, `failure-domains.ndjson`, Telegram completion reports, secrets via env / your secret manager (`CURSOR_API_KEY`, `CLINE_API_KEY`, `OPENCODE_API_KEY`, `OPENROUTER_API_KEY`, `AI_GATEWAY_API_KEY`, `AGENT_LOOP_TELEGRAM_*`, `AGENT_LOOP_CURSOR_TIMEOUT_MS`).

Verification checklist authoring: [`docs/verification-as-skill.md`](./docs/verification-as-skill.md). Freeze a **four-part finish line** (outcome, scoreboard, permission, budget) plus optional **golden** artifact — [`templates/GOAL.template.md`](./templates/GOAL.template.md). Metric loops: revert if worse than baseline — [`templates/GOAL.metric.template.md`](./templates/GOAL.metric.template.md). Visual / taste loops (homepage, mockup, screenshot-as-hero): [`templates/GOAL.visual.template.md`](./templates/GOAL.visual.template.md).

## Install

Requires **Node.js 22+**. Install from npm (works in cloud agents and any consumer repo):

```bash
# Cursor-only (minimum)
pnpm add -D @dancingteeth/agent-looper @cursor/sdk

# Optional workers
pnpm add -D @cline/sdk                                    # Cline Pass / Credits
pnpm add -D @opencode-ai/sdk opencode-ai                  # OpenCode Go / BYOK
pnpm add -D @earendil-works/pi-coding-agent               # Pi BYOK
pnpm add -D @openai/codex-sdk                             # Codex (ChatGPT / OpenAI)
```

Use CLIs via `pnpm exec` (or `npx`) so you do not need a global install:

```bash
pnpm exec agent-loop-init
pnpm exec agent-loop-setup --out .cursor/loops/my-task   # Ink TUI; --plain / --answers for agents
pnpm exec agent-check cursor
pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

## Quick start

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
export CURSOR_API_KEY=…   # or wrap with your secret manager (Doppler, etc.)

pnpm exec agent-loop-init
# Humans: pnpm exec agent-loop-setup --out .cursor/loops/my-task
#   writes repo defaults (runtime, models, review, notify) into
#   .cursor/agent-loop.repo.json. Later sparse loop.json files inherit them;
#   explicit loop.json keys win. Agents skip the TUI — use --answers or
#   copy templates and set verify only.
# edit .cursor/loops/my-task/GOAL.md + verify.sh

pnpm exec agent-check cursor
pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

Other workers (after installing the matching optional peer):

```bash
# ClinePass / Credits
export CLINE_API_KEY=…
pnpm exec agent-loop run .cursor/loops/my-task --runtime cline-pass
pnpm exec agent-loop run .cursor/loops/my-task --runtime cline

# OpenCode (needs `opencode` on PATH from opencode-ai)
export OPENCODE_API_KEY=…   # and/or OPENROUTER_API_KEY / AI_GATEWAY_API_KEY for BYOK
pnpm exec agent-check opencode
pnpm exec agent-loop run .cursor/loops/my-task --runtime opencode

# Pi BYOK
export OPENROUTER_API_KEY=…
pnpm exec agent-check pi
pnpm exec agent-loop run .cursor/loops/my-task --runtime pi
pnpm exec agent-loop run .cursor/loops/my-task --runtime pi --review-runtime pi --review-gate

# Codex (needs `codex` CLI from @openai/codex via the SDK)
export CODEX_API_KEY=…   # or OPENAI_API_KEY / ChatGPT login
pnpm exec agent-check codex
pnpm exec agent-loop run .cursor/loops/my-task --runtime codex

# DeepSeek Harness (needs `dsh` on PATH; Node ≥ 22.15)
export DEEPSEEK_API_KEY=…   # or DSH credentials-local
pnpm exec agent-check dsh
pnpm exec agent-loop run .cursor/loops/my-task --runtime dsh
# runtime: docs/dsh-runtime.md — dsh web companion: docs/dsh-plugin.md
```

Target another checkout:

```bash
pnpm exec agent-loop run /path/to/repo/.cursor/loops/fix-foo --repo-root /path/to/repo
```

Example consumer scripts:

```json
{
  "scripts": {
    "agent:loop": "doppler run -- agent-loop run",
    "agent:check": "doppler run -- agent-check cursor",
    "agent:init": "agent-loop-init"
  }
}
```

Harness maintainers developing this repo itself: build local `dist/` with `pnpm build` and run via `pnpm agent:loop` (see [`docs/dogfood.md`](./docs/dogfood.md)). Release / trusted publishing: [`docs/releasing.md`](./docs/releasing.md).

## Repo profile

`.cursor/agent-loop.repo.json`:

| Field | Purpose |
| --- | --- |
| `taskwarriorProject` | Taskwarrior project for HITL when `hitlProvider` is `taskwarrior` — **required** for TW HITL |
| `hitlProvider` | `taskwarrior` (default), `file`, `github`, `linear`, or `command` — see [`docs/hitl-providers.md`](./docs/hitl-providers.md) |
| `hitlFileDir` | Directory for `file` provider (default `.cursor/hitl`) |
| `hitlCommand` | Shell for `command` provider |
| `hitlLinearTeam` | Linear team key or id when `hitlProvider` is `linear` |
| `syncCommand` | Shell after success (or `null`) |
| `notifyCommand` | Optional shell on every CLI exit (`LOOP_*` env) |
| `notifyWebhook` | Optional JSON POST (`url` or `AGENT_LOOP_NOTIFY_WEBHOOK_URL`) |
| `notifyPrComment` | Comment on the open PR after CLI exit (`gh pr comment`) |
| `defaultBranch` | Post-loop diff base (`main`) |
| `agentsFile` / `reviewsFile` | Prompt + review overlay paths |
| `loopRiskProfile` | Optional keyword merge for `postQualityReview: "auto"` (see `REVIEWS.md` ## Loop risk inference) |
| `skillsGlob` | System prompt skills hint |
| `clientName` | Cline client label |
| `telegramNotify` | Optional chat id + onSuccess / onFailure |

Per-loop overrides in `loop.json`: `taskwarriorProject`, `taskwarriorUuid`, `hitlCheck`, `hitlOnFailure`, `requireNotify`, and optional `hitlProvider` / `hitlFileDir` / `hitlCommand` / `hitlLinearTeam`.

**Taskwarrior:** use **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` — numeric IDs are recycled. On success with `syncOnSuccess`, the harness marks that UUID done.

## Loop bundle

```text
.cursor/loops/my-task/
  GOAL.md                  # frozen spec (four-part finish line + optional golden)
  RESEARCH.md              # optional — frozen brownfield map (indexed in the worker prompt)
  loop.json                # verify, runtime, optional taskwarriorUuid
  verify.sh                # measurable shell checks (exit 0 = pass)
  VERIFY.skill.md          # agent-readable verify procedure (optional; required for verifyMode: skill)
  log.ndjson               # append-only iteration log (runtime)
  run-report.md            # human-readable run summary (when exportRunReport)
  transcript.ndjson        # tool timeline (when exportTranscript)
  verify-logs/             # optional — sidecar verify stdout/stderr (`verifyLogMode`)
  failure-domains.ndjson   # optional — stagnation / max iterations / gate exhaust
  failure-context.md       # optional — written by meta-loop probe for fix loop
```

### Verification (`verify` / `verifyMode`)

| Field | Default | Purpose |
| --- | --- | --- |
| `verify` | (required) | Shell command every iteration (usually `bash …/verify.sh`). Exit `0` = pass. |
| `verifyMode` | `command` | `command` = shell only. `skill` = verify agent reads `verifySkill`, emits `VERIFY_RESULT: PASS/FAIL`, then runs shell `verify` on PASS. Skill-verify uses the same iteration agent as the worker (reasoning ladder / `escalateModel` apply). |
| `verifySkill` | — | Path to `VERIFY.skill.md` (required when `verifyMode` is `skill`). |
| `finalVerify` | — | Stricter outer check after inner `verify` passes. |
| `verifyLogMode` | `inline` | How verify stdout/stderr reach the next worker. `inline` pastes the capture. `sidecar` is **optional**: write `<loop-dir>/verify-logs/` and put a ~600-character preview + path in the prompt. Leave unset / `inline` when verify is short. |

Default stays **`inline`**. Use `"verifyLogMode": "sidecar"` only when verify dumps are large (full vitest / Playwright / compiler walls) and would otherwise repeat in every later prompt. Sidecar does not change the verifier; capture is still capped (~64KB) before anything is written to disk.

Legacy `loop.json` field `syncPostgres` maps to `syncOnSuccess`.

### loop.json — loop control

| Field | Default | Purpose |
| --- | --- | --- |
| `runtime` | `cursor` | Worker: `cursor` \| `cline-pass` \| `cline` \| `opencode` \| `pi` \| `codex` \| `dsh`. Unset when `costPreset` is set so detection can bind. See [`docs/runtime-map.md`](./docs/runtime-map.md). Same-task cost method: [`docs/runtime-cost-bench.md`](./docs/runtime-cost-bench.md). |
| `costPreset` | — | Named worker+judge stack: `minmax` (efficiency — cheapest *capable* worker + strongest included judge; Grok whenever Cursor is installed), `balanced` (escalate-tier worker, same judge), `cursor` (Composer + Grok). Detect-bound at parse when `runtime`/`model` are unset; explicit keys win. Not Auto. |
| `model` / `escalateModel` | (defaults) | Worker model; escalate on stagnation (OpenCode/Pi/Codex/DSH: after threshold; Cline: after reasoning ceiling). |
| `maxIterations` | `8` | Cap implement iterations. |
| `maxCostUsd` | — | Dollar cap: refuse to start a billed **worker** call whose predicted cost exceeds remaining budget; after a finished worker (or billed review) that still crosses it, stop `waiting` + HITL `budget` (`--max-cost`). Omit = no cap. |
| `stagnationThreshold` | `3` | Stop after N identical verifier failures (`0` = disable). |
| `mode` | `forward` | `reverse` = clean-room rebuild (`templates/GOAL.reverse.template.md`) |
| `pauseAfterIteration` | `false` | Wait for Enter after each iteration (TTY only) |
| `injectFailureContext` | `false` | Read `failure-context.md` into the prompt (meta-loop fix rounds) |
| `syncOnSuccess` | `true` | Run repo profile `syncCommand` after success |
| `notifyTelegram` | `true` | Send completion report when Telegram env + profile are configured |
| `telegramAttachReview` | `true` | Attach `review.md` as a second Telegram message |
| `hitlOnFailure` | `false` | Open HITL checkpoint when the loop ends incomplete |
| `requireNotify` | `false` | Abort if Telegram preflight fails (also `--require-notify`) |
| `completionSignal` | `true` | Emit `AGENT_LOOP_DONE` on stdout when the CLI exits (local Cursor wake; Cloud Agents cannot attach a watcher yet) |
| `notifyCommand` | — | Override repo profile `notifyCommand` for this loop |
| `exportPack` | `true` | Copy curated artifacts to `.cursor/loop-exports/<slug>/` (commit-friendly) |
| `notifyPrComment` | — | Override profile `notifyPrComment` for this loop |
| `reasoningEffort` | — | `low` \| `medium` \| `high` \| `xhigh` \| `none` when the runtime honors it (Cline, Pi). Omit or `none` = no extra thinking. Cursor / OpenCode / Codex / DSH ignore it. |
| `escalateReasoningEffort` | — | Reasoning ladder ceiling (same runtimes as `reasoningEffort`). Applies to the worker **and** skill-verify. |
| `reasoningEscalationStep` | `1` | Tiers to step per iteration (`1` or `2`) |
| `escalateModelReasoningEffort` | — | Reasoning tier on escalated model |
| `escalateAfterStagnation` | `2` | Identical-failure count before model switch (after reasoning ceiling) |
| `skills` | — | Explicit `…/SKILL.md` paths (merged with GOAL refs). Default prompt is an **index** (name, description, path) — worker **Read**s the file when needed. |
| `skillDisclosure` | `index` | `index` = progressive disclosure (0.4.0 default; 0.3.0 always inlined). `inline` = paste full SKILL.md bodies. Pin the field on any loop that must keep the old in-prompt runbook. |
| `plugins` | — | Agent Plugins package dirs — discovers `skills/*/SKILL.md` ([`docs/agent-plugins.md`](./docs/agent-plugins.md)) |
| `research` | — | Optional path to a frozen brownfield map. If unset, the harness indexes `RESEARCH.md` beside `GOAL.md` when that file exists. Prompt gets path + one-line (worker **Read**s it); body is not inlined. Template: [`templates/RESEARCH.example.md`](./templates/RESEARCH.example.md). |

### loop.json — review & quality

| Field | Default | Purpose |
| --- | --- | --- |
| `postQualityReview` | `auto` | Run post-loop review (`true` / `false` / `auto` by inferred risk) |
| `reviewRisk` | `auto` | Override inferred risk for `postQualityReview: "auto"` (`high` / `medium` / `low`) |
| `loopRiskProfile` | — | Per-loop keyword merge for risk inference (`high` / `medium` / `low` arrays) |
| `reviewGate` | `false` | When `true`, gating blockers re-enter the fix loop (up to `maxReviewCycles`) |
| `reviewRuntime` | `cursor` | Primary judge runtime (same enum as `runtime`). Unset → cursor. |
| `reviewModel` | (resolved) | Judge model for `reviewRuntime`. Cursor defaults: `grok-4.6` when worker is `cursor`, else `composer-2.5`. OpenCode judge (`reviewRuntime: "opencode"`) defaults to **`opencode-go/deepseek-v4-pro`** (worker stays Flash). DSH judge (`reviewRuntime: "dsh"`) defaults to **`deepseek-official/deepseek-v4-pro`**. Codex judge (`reviewRuntime: "codex"`) defaults to **`gpt-5.6-sol`** (worker stays Luna). Pi / Cline judges use that runtime’s worker default. Never Composer Fast on cursor. |
| `maxReviewCycles` | `2` | Review-triggered fix rounds when `reviewGate` is on |
| `reviewGateHitl` | `false` | On gate exhaust, open a HITL checkpoint (`hitlProvider`) instead of hard-fail only |
| `unparseableReviewRetries` | `2` | Retries when verdict cannot be parsed |
| `reviewBlockerRecheck` | `true` | On BLOCKERS fix rounds, lighter scope-limited re-check |
| `reviewReproduce` | `false` | Path filter on error+impact blockers (changed-files set) |
| `reviewReproduceAgent` | `false` | Fresh KEEP/DROP session on gating blockers (needs `reviewReproduce`; uses primary `reviewRuntime`) |
| `reviewSecondaryRuntime` | (unset) | Second residual judge (`cursor` \| `cline-pass` \| `cline` \| `opencode` \| `pi` \| `codex` \| `dsh`); unset = off |
| `reviewSecondaryModel` | (default) | Model for secondary review (defaults per that runtime) |
| `trustConfig` | `false` | Mark this loop's shell commands as pre-reviewed (pairs with `--trust-config` gate) |
| `exportRunReport` | `true` | Write `run-report.md` when the loop finishes |
| `exportTranscript` | `true` | Record tool events in `transcript.ndjson` and per-iteration tool counts in `log.ndjson` |

Blocker grammar: ship `REVIEWS.md` from `templates/REVIEWS.md`. Library: `reviewVerdictAllowsCompletion` takes a full `ParsedReview` for impact-severity gating.

### loop.json — reserved fields (experimental)

These fields validate in `loop.json` but their pipeline hooks are **not executed yet**.
The harness logs a `loop extension preflight` note on every run (CLI, batch, and direct
library calls) when they are configured — do not rely on them gating anything:

| Field | Status |
| --- | --- |
| `smokeScripts` | reserved — post-verifier hook not implemented |
| `siblingRepos` | partially wired — recorded in `log.ndjson`; cross-repo verify not implemented |
| `verifyPreflight` | reserved — not implemented |

### `postQualityReview: "auto"` and loop risk

When `postQualityReview` is `"auto"` (default), the harness infers **high / medium / low**
from keywords in `GOAL.md` + the `verify` command. Review runs when tier is not `low`.
`reviewGate: true` always runs review regardless.

Merge order (each layer adds keywords; first match wins high → medium → low):

1. Harness defaults (`DEFAULT_LOOP_RISK_KEYWORDS` in `loopRiskProfile.ts`)
2. `REVIEWS.md` → `## Loop risk inference` → `### HIGH` / `MEDIUM` / `LOW`
3. `.cursor/agent-loop.repo.json` → `loopRiskProfile`
4. `loop.json` → `loopRiskProfile` (per-loop merge)

Override inference entirely: `"reviewRisk": "high"` | `"medium"` | `"low"` in `loop.json`.

Preview without running the loop:

```bash
agent-loop-review-preview .cursor/loops/my-task
```

Example repo overlay (`agent-loop.repo.json`; full sample: `templates/agent-loop.repo.json.example`):

```json
{
  "loopRiskProfile": {
    "high": ["stripe-webhook", "crm-admin"],
    "medium": ["checkout"],
    "low": ["copy-only"]
  }
}
```

Example per-loop override (`loop.json`):

```json
{
  "postQualityReview": "auto",
  "reviewRisk": "auto",
  "loopRiskProfile": { "high": ["payment-refund"] }
}
```

CLI overrides: `--mode reverse`, `--pause-after-iteration`, `--review-gate`, `--no-telegram`, `--review-runtime <id>`, `--review-model <id>`, `--review-secondary-runtime <id>`, `--review-secondary-model <id>`.

## Review gate flow

When `reviewGate: true` and verify passes:

```text
primary review (reviewRuntime + reviewModel; default cursor)
  → optional reviewReproduce path filter
  → optional reviewReproduceAgent KEEP/DROP
  → optional reviewSecondaryRuntime merge
  → gating blockers remain? → fix iteration (up to maxReviewCycles)
  → else PASS / ADVISORY → complete
```

Unparseable verdicts retry (`unparseableReviewRetries`). Gate exhaust can escalate to HITL (`reviewGateHitl`).

## Ralph loop alignment

Implements the [Ralph loop](https://ghuntley.com/loop/) pattern:

- **Monolithic** — one repo, one process, one task per loop
- **Fresh context** each iteration; progress in **files and git**
- **Shell backpressure** (`verify` / `finalVerify`) as the deterministic done signal
- **Verification-as-skill** — `verify.sh` + `VERIFY.skill.md`; optional `verifyMode: skill`
- **Watch the loop** — `log.ndjson`, `run-report.md`, `transcript.ndjson`, stagnation, optional `--pause-after-iteration`
- **Completion sentinel** — stdout `AGENT_LOOP_DONE {…}` when the CLI exits (for attached local Shell `notify_on_output` or log grep; do **not** background the job — see below)
- **Failure domains** — `failure-domains.ndjson` on stagnation, max iterations, or review-gate exhaustion
- **Meta-loop** — probe → `failure-context.md` → fix → re-probe

Forward = incremental fix-until-green. Reverse = clean-room prompt guidance; enforce scope via `verify` and `GOAL.md`.

## Meta-loop (probe → fix → re-probe)

In `loop-batch.json`:

```json
{
  "metaLoop": {
    "probe": "system-smoke",
    "fix": "fix-from-smoke",
    "maxCycles": 3
  },
  "hitlCheck": "Manual QA after meta-loop",
  "taskwarriorProject": "my-project"
}
```

Cycle: probe → on failure write `failure-context.md` into the fix bundle → fix with `injectFailureContext` → re-probe. Stops when probe passes or `maxCycles` is exhausted. See `templates/loop-batch.meta.example.json`.

### Sequential batch with per-item rubrics

Each `loops[]` entry is either a sibling loop name/path (string) or `{ "path": "...", "rubric": "..." }`. When `rubric` is set, the batch runner injects a volatile **Batch rubric** section into that loop’s worker prompt; shell `verify` remains the exit gate. See `templates/loop-batch.example.json`.

### Cross-loop meta-review

Read-only aggregator over N loop bundles (does **not** re-run workers or flip per-loop `complete` flags):

```bash
agent-loop-meta-review .cursor/loops --out-dir /tmp/meta-out
agent-loop-meta-review .cursor/loops --review-runtime opencode --review-model openrouter/anthropic/claude-sonnet-4
agent-loop-meta-review .cursor/loops/a .cursor/loops/b --hitl --project my-project
```

Collects latest `review.md*`, `log.ndjson`, `failure-domains.ndjson`, and diff stat vs `defaultBranch`. When in-loop files are missing (typical after a cloud clone — those paths are gitignored), falls back to **`.cursor/loop-exports/<slug>/`**. Prompt brief: [`docs/meta-review-prompt.md`](./docs/meta-review-prompt.md).

## CLIs

| Command | Description |
| --- | --- |
| `agent-loop run <dir>` | Single loop |
| `agent-loop watch <dir>` | Live progress: Ink watch view (TTY) or structured phase lines; `--snapshot` prints one frame and exits |
| `agent-loop-batch <dir>` | `loop-batch.json` sequential or meta-loop |
| `agent-check cursor\|cline\|opencode\|pi\|codex\|dsh` | SDK + API key smoke (`dsh`: PATH CLI + Node ≥ 22.15) |
| `agent-loop-init` | Scaffold templates |
| `agent-loop-setup` | Ink TUI / `--plain` / `--answers` wizard: repo `defaults` in `.cursor/agent-loop.repo.json` plus `loop.json` for `--out` |
| `agent-loop-doctor` | Validate install / `dist/` integrity; model pricing drift vs `CLINE_PASS_LOOP_MODELS` |
| `agent-loop-meta-review` | Cross-loop meta-review (read-only) |
| `agent-loop-review-run` | Post-loop quality review for one bundle |
| `agent-loop-review-preview` | Preview review risk / prompt |
| `agent-loop-export-run` | Regenerate `run-report.md` from `log.ndjson` (+ optional `transcript.ndjson`) |

## Architecture

```text
GOAL.md + loop.json
  → fresh worker agent
  → verify (command or skill + command)
  → optional review gate
  → log.ndjson
  → run-report.md (+ transcript.ndjson when enabled)
  → .cursor/loop-exports/<slug>/ (curated pack; commit-friendly)
  → repeat
```

Post-success (when `postQualityReview` runs): quality review → `review.md` using the repo `REVIEWS.md` overlay. With `reviewGate: true`, only **gating** blockers re-enter the fix loop; completion requires **PASS** or **ADVISORY** with no gating blockers. Then: optional linked-task completion (e.g. Taskwarrior `done`) → `hitlCheck` (via `hitlProvider`) → `syncCommand`.

Stderr prints token totals and estimated USD (ClinePass may include cached-input counts).

| Layer | Role | Blocks loop? |
| --- | --- | --- |
| Shell `verify` / `finalVerify` (+ optional skill pre-pass) | Deterministic judge | **Yes** |
| `postQualityReview` (no gate) | Advisory LLM | No |
| `reviewGate: true` | Gate on gating blockers / unparseable verdict | **Yes** |

## Threat model

For **trusted checkouts** you control:

- `verify` / `finalVerify` / `syncCommand` run via `shell: true` — malicious config = arbitrary shell.
- Verifier stdout/stderr is injected into the next worker prompt (soft guardrails only).
- On start, the CLI prints configured shell commands and flags obvious exfil patterns (`curl`, `wget`, `| sh`, backticks, `$()`).

**Trust gate (opt-in strict mode):**

- Default: warn + tip (`--trust-config` after review).
- `--require-trust-config` or `AGENT_LOOP_REQUIRE_TRUST_CONFIG=1`: abort unless you pass `--trust-config`, set `trustConfig: true` in `loop.json`, or `AGENT_LOOP_TRUST_CONFIG=1`.
- Dogfood / CI: set `trustConfig: true` on known-safe loop bundles, or export `AGENT_LOOP_TRUST_CONFIG=1` in Doppler.

Only run on repos and loop bundles you trust. Review `loop.json` and `.cursor/agent-loop.repo.json` first.

## Environment variables

| Variable | Role |
| --- | --- |
| `CURSOR_API_KEY` | Cursor SDK auth (worker and/or default judge) |
| `CLINE_API_KEY` | Cline SDK auth (optional peer runtime / secondary judge) |
| `OPENCODE_API_KEY` | OpenCode Go auth (optional peer; https://opencode.ai/go) |
| `OPENROUTER_API_KEY` | OpenRouter BYOK for OpenCode / Pi workers and judges |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway BYOK for OpenCode (`vercel/…` models; harness `auth.set`) |
| `CODEX_API_KEY` / `OPENAI_API_KEY` | Codex SDK auth (optional; else ChatGPT CLI login) |
| `AGENT_LOOP_VERBOSE` | `1` / `true` — extra stderr stream detail |
| `AGENT_LOOP_CURSOR_TIMEOUT_MS` | Cursor run timeout in milliseconds (default **2700000** = 45m). Must be a positive number; validated before `Agent.create` so a bad value fails without burning a paid run. On timeout the harness cancels the remote run. |
| `AGENT_LOOP_TRUST_CONFIG` | `1` — treat shell config as reviewed/trusted |
| `AGENT_LOOP_REQUIRE_TRUST_CONFIG` | `1` — abort unless trust is set (CLI / env / `loop.json`) |
| `AGENT_LOOP_TELEGRAM_BOT_TOKEN` | Telegram bot token (fallback: `TELEGRAM_BOT_TOKEN`) |
| `AGENT_LOOP_TELEGRAM_CHAT_ID` | Telegram chat id (or `telegramNotify.chatId` in the repo profile) |
| `AGENT_LOOP_NO_COMPLETION_SIGNAL` | `1` — skip `AGENT_LOOP_DONE` stdout line on CLI exit |
| `AGENT_LOOP_NOTIFY_WEBHOOK_URL` | JSON webhook URL when `notifyWebhook` is enabled without inline `url` |
| `AGENT_LOOP_PR_NUMBER` | PR number for `notifyPrComment` (fallback: `GH_PR_NUMBER`, then `gh pr view`) |

## Telegram completion reports

On finish (success or failure), optional short report:

- Status, repo, bundle/batch, iterations, reason
- Token/cost line
- Review verdict when present
- Last verifier snippet on failure

Optional second message: attach `review.md` as a document. Opt out with `"telegramAttachReview": false` or profile `"attachReview": false`.

**Setup:**

1. Bot token in env: `AGENT_LOOP_TELEGRAM_BOT_TOKEN` (or `TELEGRAM_BOT_TOKEN`)
2. Chat id: `AGENT_LOOP_TELEGRAM_CHAT_ID` or `telegramNotify.chatId` in the repo profile
3. Inject secrets the same way you already run the loop (`doppler run`, direnv, CI secrets, …)

**Opt out:** `"notifyTelegram": false` or `--no-telegram`. Notify send failures are non-blocking for exit code, but if Telegram was configured and a **failure** report did not land, the harness opens a HITL checkpoint (`notify_failed`) via `hitlProvider`. Use `--require-notify` / `requireNotify: true` to abort before the loop when `getMe` preflight fails.

## Running from Cursor chat

Cursor’s **agent Shell** is not a terminal. `block_until_ms: 0` (or the IDE **background** button) is a child the IDE reaps at **~5 minutes** (`status: aborted`, `exit_code: unknown`, often pnpm **255`) while the worker is still mid-turn. That is not the harness: TTFB stall is 3 min with no events; overall timeout is **45 min**.

**If you are the agent in this chat, you start the loop. Do not print a command and tell the human to run it.** Walk-away is not your fallback.

| Intent | How |
| --- | --- |
| This chat (default) | Shell **attached**: `block_until_ms` ≥ 45m (`2700000`). `notify_on_output` on `^AGENT_LOOP_DONE `. |
| Human asked to walk away | **Their** terminal (`pnpm agent:loop …`). Telegram / HITL / webhook wake them. |

Never `block_until_ms: 0` for `agent-loop` or `agent-loop-batch`. Re-attach after an abort; do not treat it as a harness failure.

`AGENT_LOOP_DONE` is a stdout sentinel for an **attached** watcher or log grep. Opt out: `--no-completion-signal`, `"completionSignal": false`, or `AGENT_LOOP_NO_COMPLETION_SIGNAL=1`.

Example payload:

```text
AGENT_LOOP_DONE {"v":1,"kind":"loop","bundle":".cursor/loops/my-task","complete":true,"exitCode":0,"reason":"Verifier passed (exit 0).","iterations":2,"runReport":".cursor/loops/my-task/run-report.md"}
```

Human logs stay on **stderr**; the sentinel is written with **`fs.writeSync(1, …)`** so piped stdout is not lost before `process.exit`. Side channels (`notifyWebhook` / `notifyCommand` / PR comment) run **after** the sentinel and are time-capped so a hung hook cannot delay wake.

### Cloud Agents

**Cloud Agent Shell does not expose `notify_on_output` today**, so this chat cannot attach a regex watcher even though the harness still emits `AGENT_LOOP_DONE`. Until Cursor adds that (or an equivalent wake), treat cloud completion as:

- **`notifyWebhook`** — JSON POST to Slack/Discord/n8n (`AGENT_LOOP_NOTIFY_WEBHOOK_URL` in Doppler)
- **`notifyPrComment: true`** — `gh pr comment` on the branch PR (set when the cloud agent already opened a PR)
- **Telegram** (`notifyTelegram` + env; `--require-notify` to fail closed)
- **HITL** (`hitlOnFailure`, Linear / file / github with an issue-capable token)
- **Export packs** — commit or attach `.cursor/loop-exports/<slug>/` so meta-review and humans can read reviews without gitignored mid-run files

Do not promise in-chat wake from `AGENT_LOOP_DONE` on Cloud Agents.

## Export packs (cloud / PR audit)

In-loop `review.md` / `log.ndjson` / `run-report.md` stay **gitignored** (noisy mid-run). When `exportPack: true` (default), each finished loop also writes a curated snapshot to:

```text
.cursor/loop-exports/<slug>/
  SUMMARY.md
  meta.json
  run-report.md      # when present
  review.md          # latest review when present
  log-tail.ndjson    # last ~40 log lines
  failure-domains.ndjson
```

**Commit that directory** (or attach it on the PR) so cloud clones and meta-review are not a black box. Cloud agent tip: after the loop, `git add .cursor/loop-exports && git commit && git push` on the loop branch. Batch completion webhooks/PR comments list every existing child export pack (comma-separated / bullet list).

## `notifyWebhook` + PR comments

Repo profile:

```json
{
  "notifyWebhook": { "onSuccess": true, "onFailure": true },
  "notifyPrComment": true
}
```

Put the URL in Doppler as `AGENT_LOOP_NOTIFY_WEBHOOK_URL` (or set `notifyWebhook.url`). Payload is JSON (`v`, `kind`, `bundle`, `complete`, `exitCode`, `reason`, `exportPack`, …). POSTs are aborted after ~8s; stderr logs redact query/hash from the URL.

`notifyPrComment` runs `gh pr comment` for the current branch’s PR (or `AGENT_LOOP_PR_NUMBER`). Same `gh` auth as GitHub HITL — works with a user/PAT that can comment; GitHub App tokens often can comment on PRs even when they cannot `issue create`.

## `notifyCommand` (shell fallback)

Optional shell with `LOOP_*` env (`LOOP_EXPORT_PACK`, `LOOP_RUN_REPORT`, …) when you need custom logic beyond JSON webhook. Non-blocking; ~15s timeout; shell-trust gated. Opt out: `--no-notify-command`.

## License

MIT

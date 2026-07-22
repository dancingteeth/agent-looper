---
tags:
  - documentation
  - agents
---
# @dancingteeth/agent-loop

Repo-agnostic **fix-until-green** harness: a worker agent edits the repo, a shell verifier decides “done,” an optional judge can send the worker back — with a fresh context every iteration.

Supports **Cursor SDK** (`composer-2.5` worker + `grok-4.5` judge) and **Cline SDK** (`@cline/sdk`) — **ClinePass** (`runtime: cline-pass`) or **Credits** (`runtime: cline`).

New here? Start with [`README.intro.md`](./README.intro.md) (how the loop works, worker vs judge, why it’s shaped this way). Technical deep dive: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Features at a glance

| Layer | What it does | Blocks completion? |
| --- | --- | --- |
| **Worker** | Fresh Cursor or Cline SDK session each iteration; implements toward `GOAL.md` | — (does the work) |
| **Verifier** | Shell `verify` / `finalVerify` (exit `0`). Optional `verifyMode: skill` runs a verify agent first (`VERIFY_RESULT: PASS/FAIL`), then shell. | **Yes** — hard gate |
| **Review** | Post-success LLM quality review → `review.md`. Optional `reviewGate` re-opens the fix loop on **gating** findings only. | Only with `reviewGate: true` |
| **Human** | `reviewGateHitl`, `hitlCheck`, optional Taskwarrior UUID auto-done on success | Closure authority |

**Review stack** (opt-in unless noted):

1. **Impact-severity** — only `severity: error` + recognized `impact` tags gate (`data-loss`, `security-boundary`, `false-closure`, `cross-dispatch`, `verify-bypass`). Cosmetic findings stay advisory.
2. **Reproduce-before-report** — `reviewReproduce`: drop error+impact blockers without a citeable path in the changed-files set.
3. **Fresh reproduce agent** — `reviewReproduceAgent`: second Cursor session KEEP/DROP on remaining gating blockers.
4. **Secondary-family judge** — `reviewSecondaryRuntime` on Cline SDK (`cline-pass` or `cline`): union gating blockers with primary; skips when primary is PASS/ADVISORY with zero gates.

**Factory scale:** `agent-loop-batch` (sequential + meta-loop probe→fix), `agent-loop-meta-review` (read-only cross-loop report over N bundles).

**Ops:** stagnation detection, `failure-domains.ndjson`, Telegram completion reports, secrets via env / your secret manager (`CURSOR_API_KEY`, `CLINE_API_KEY`, `AGENT_LOOP_TELEGRAM_*`).

Verification checklist authoring: [`docs/verification-as-skill.md`](./docs/verification-as-skill.md).

## Install

Requires **Node.js 22+** for Cline SDK runtimes.

```bash
# Cursor-only
pnpm add -D @dancingteeth/agent-loop @cursor/sdk

# Optional Cline SDK worker (ClinePass or Credits)
pnpm add -D @cline/sdk
```

Or link a local checkout during development:

```bash
pnpm link --global   # from the agent-loop package root
# in your app repo:
pnpm link -g @dancingteeth/agent-loop
```

### `file:` dependency

Pin a relative path to a local checkout, e.g. `"@dancingteeth/agent-loop": "file:../agent-loop"`. That path must exist when you `pnpm install`.

| When | What |
| --- | --- |
| Install in the package | `prepare` builds `dist/` if incomplete |
| Install in a consumer with doctor wired | `postinstall` can run `agent-loop-doctor --install-check` |
| Anytime | `pnpm exec agent-loop-doctor` — dist + `file:` path diagnostics |

## Quick start

From any repository root:

```bash
agent-loop-init
# edit .cursor/agent-loop.repo.json
# edit .cursor/loops/my-task/GOAL.md + loop.json + verify.sh

export CURSOR_API_KEY=…   # or wrap with your secret manager
agent-check cursor

# Cursor worker (Composer 2.5) + Grok 4.5 judge
agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

Cline SDK workers:

```bash
export CLINE_API_KEY=…
# ClinePass (subscription)
agent-loop run .cursor/loops/my-task --runtime cline-pass
# Credits (pay-as-you-go; use OpenRouter-style model ids)
agent-loop run .cursor/loops/my-task --runtime cline
```

Target another checkout:

```bash
agent-loop run /path/to/repo/.cursor/loops/fix-foo --repo-root /path/to/repo
```

Example consumer scripts:

```json
{
  "scripts": {
    "agent:loop": "doppler run -- agent-loop run",
    "agent:check": "doppler run -- agent-check cursor"
  }
}
```

## Repo profile

`.cursor/agent-loop.repo.json`:

| Field | Purpose |
| --- | --- |
| `taskwarriorProject` | HITL tasks land here — **required** when using `hitlCheck` |
| `syncCommand` | Shell command after success (or `null`) |
| `defaultBranch` | Post-loop diff base (`main`) |
| `agentsFile` / `reviewsFile` | Prompt + review overlay paths |
| `loopRiskProfile` | Optional keyword merge for `postQualityReview: "auto"` (see `REVIEWS.md` ## Loop risk inference) |
| `skillsGlob` | System prompt skills hint |
| `clientName` | Cline client label |
| `telegramNotify` | Optional chat id + onSuccess / onFailure |

Per-loop overrides in `loop.json`: `taskwarriorProject`, `taskwarriorUuid`, `hitlCheck`.

**Taskwarrior:** use **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` — numeric IDs are recycled. On success with `syncOnSuccess`, the harness marks that UUID done.

## Loop bundle

```text
.cursor/loops/my-task/
  GOAL.md                  # frozen spec
  loop.json                # verify, runtime, optional taskwarriorUuid
  verify.sh                # measurable shell checks (exit 0 = pass)
  VERIFY.skill.md          # agent-readable verify procedure (optional; required for verifyMode: skill)
  log.ndjson               # append-only iteration log (runtime)
  run-report.md            # human-readable run summary (when exportRunReport)
  transcript.ndjson        # tool timeline (when exportTranscript)
  failure-domains.ndjson   # optional — stagnation / max iterations / gate exhaust
  failure-context.md       # optional — written by meta-loop probe for fix loop
```

### Verification (`verify` / `verifyMode`)

| Field | Default | Purpose |
| --- | --- | --- |
| `verify` | (required) | Shell command every iteration (usually `bash …/verify.sh`). Exit `0` = pass. |
| `verifyMode` | `command` | `command` = shell only. `skill` = verify agent reads `verifySkill`, emits `VERIFY_RESULT: PASS/FAIL`, then runs shell `verify` on PASS. |
| `verifySkill` | — | Path to `VERIFY.skill.md` (required when `verifyMode` is `skill`). |
| `finalVerify` | — | Stricter outer check after inner `verify` passes. |

Legacy `loop.json` field `syncPostgres` maps to `syncOnSuccess`.

### loop.json — loop control

| Field | Default | Purpose |
| --- | --- | --- |
| `runtime` | `cursor` | `cursor` \| `cline-pass` (ClinePass) \| `cline` (Credits). Cursor defaults: worker `composer-2.5`, judge `grok-4.5`. |
| `model` / `escalateModel` | (defaults) | Worker model; escalate on stagnation after reasoning ceiling (Cline). |
| `maxIterations` | `8` | Cap implement iterations. |
| `stagnationThreshold` | `3` | Stop after N identical verifier failures (`0` = disable). |
| `mode` | `forward` | `reverse` = clean-room rebuild (`templates/GOAL.reverse.template.md`) |
| `pauseAfterIteration` | `false` | Wait for Enter after each iteration (TTY only) |
| `injectFailureContext` | `false` | Read `failure-context.md` into the prompt (meta-loop fix rounds) |
| `syncOnSuccess` | `true` | Run repo profile `syncCommand` after success |
| `notifyTelegram` | `true` | Send completion report when Telegram env + profile are configured |
| `telegramAttachReview` | `true` | Attach `review.md` as a second Telegram message |
| `reasoningEffort` | — | Cline: `low` \| `medium` \| `high` \| `xhigh` \| `none`. Cursor ignores. |
| `escalateReasoningEffort` | — | Cline reasoning ladder ceiling |
| `reasoningEscalationStep` | `1` | Tiers to step per iteration (`1` or `2`) |
| `escalateModelReasoningEffort` | — | Reasoning tier on escalated model |
| `escalateAfterStagnation` | `2` | Identical-failure count before model switch (after reasoning ceiling) |

### loop.json — review & quality

| Field | Default | Purpose |
| --- | --- | --- |
| `postQualityReview` | `auto` | Run post-loop review (`true` / `false` / `auto` by inferred risk) |
| `reviewRisk` | `auto` | Override inferred risk for `postQualityReview: "auto"` (`high` / `medium` / `low`) |
| `loopRiskProfile` | — | Per-loop keyword merge for risk inference (`high` / `medium` / `low` arrays) |
| `reviewGate` | `false` | When `true`, gating blockers re-enter the fix loop (up to `maxReviewCycles`) |
| `reviewModel` | (runtime) | Cursor judge: default `grok-4.5` on `cursor`, `composer-2.5` on Cline. Never Composer Fast. |
| `maxReviewCycles` | `2` | Review-triggered fix rounds when `reviewGate` is on |
| `reviewGateHitl` | `false` | On gate exhaust, open a HITL Taskwarrior task instead of hard-fail |
| `unparseableReviewRetries` | `2` | Retries when verdict cannot be parsed |
| `reviewBlockerRecheck` | `true` | On BLOCKERS fix rounds, lighter scope-limited re-check |
| `reviewReproduce` | `false` | Path filter on error+impact blockers (changed-files set) |
| `reviewReproduceAgent` | `false` | Fresh Cursor KEEP/DROP on gating blockers (needs `reviewReproduce`) |
| `reviewSecondaryRuntime` | (unset) | Cline SDK second-family judge (`cline-pass` or `cline`); unset = off |
| `reviewSecondaryModel` | (default) | Cline model for secondary review |
| `trustConfig` | `false` | Mark this loop's shell commands as pre-reviewed (pairs with `--trust-config` gate) |
| `exportRunReport` | `true` | Write `run-report.md` when the loop finishes |
| `exportTranscript` | `true` | Record tool events in `transcript.ndjson` and per-iteration tool counts in `log.ndjson` |

Blocker grammar: ship `REVIEWS.md` from `templates/REVIEWS.md`. Library: `reviewVerdictAllowsCompletion` takes a full `ParsedReview` for impact-severity gating.

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

CLI overrides: `--mode reverse`, `--pause-after-iteration`, `--review-gate`, `--no-telegram`, `--review-model <id>`.

## Review gate flow

When `reviewGate: true` and verify passes:

```text
primary Cursor review (reviewModel)
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

### Cross-loop meta-review

Read-only aggregator over N completed loop bundles (does **not** re-run workers or flip per-loop `complete` flags):

```bash
agent-loop-meta-review .cursor/loops --out-dir /tmp/meta-out
agent-loop-meta-review .cursor/loops/a .cursor/loops/b --hitl --project my-project
```

Collects latest `review.md*`, `log.ndjson`, `failure-domains.ndjson`, and diff stat vs `defaultBranch`. Prompt brief: [`docs/meta-review-prompt.md`](./docs/meta-review-prompt.md).

## CLIs

| Command | Description |
| --- | --- |
| `agent-loop run <dir>` | Single loop |
| `agent-loop-batch <dir>` | `loop-batch.json` sequential or meta-loop |
| `agent-check cursor\|cline` | SDK + API key smoke |
| `agent-loop-init` | Scaffold templates |
| `agent-loop-doctor` | Validate `dist/` + `file:` checkout path; model pricing drift vs `CLINE_PASS_LOOP_MODELS` |
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
  → repeat
```

Post-success (when `postQualityReview` runs): Cursor quality review → `review.md` using the repo `REVIEWS.md` overlay. With `reviewGate: true`, only **gating** blockers re-enter the fix loop; completion requires **PASS** or **ADVISORY** with no gating blockers. Then: optional Taskwarrior `done` → `hitlCheck` → `syncCommand`.

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

**Opt out:** `"notifyTelegram": false` or `--no-telegram`. Notify is non-blocking.

## License

MIT

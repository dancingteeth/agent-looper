---
tags:
  - documentation
  - agents
---
# @dancingteeth/agent-loop

Repo-agnostic **fix-until-green** agent loop: fresh agent context per iteration, shell verifier, `log.ndjson`, optional Taskwarrior hooks.

Supports **Cursor SDK** (`composer-2.5` worker + `grok-4.5` judge), **ClinePass**, and **Cline credits**.

## Install

```bash
# Cursor-only (no 3rd-party SDKs)
pnpm add -D @dancingteeth/agent-loop @cursor/sdk

# Optional ClinePass / credits worker
pnpm add -D @cline/sdk
```

Or link during development:

```bash
cd ~/Projects/agent-loop && pnpm link --global
cd ~/Projects/zwook && pnpm link -g @dancingteeth/agent-loop
```



### `file:` consumers (Maxin, Zwook, …)

Loop repos pin the harness with a **relative** `file:` **path** (e.g. `file:../../agent-loop` or `file:../agent-loop`). That path must exist on disk when you `pnpm install` — usually as a **sibling checkout** or symlink to `~/Projects/agent-loop`.

**Adding a new consumer?** See `[CONSUMERS.md](./CONSUMERS.md)` — full checklist (dependency, postinstall, integration test, Docker stub).

**One-time setup** (from agent-loop):

```bash
chmod +x scripts/ensure-file-dep-link.sh
./scripts/ensure-file-dep-link.sh ~/Projects/multi-store/payload-ecommerce
./scripts/ensure-file-dep-link.sh ~/Projects/zwook
cd ~/Projects/agent-loop && pnpm install && pnpm build
cd <consumer> && pnpm install
```

**Guards:**


| When                         | What                                                            |
| ---------------------------- | --------------------------------------------------------------- |
| `pnpm install` in agent-loop | `prepare` builds `dist/` if incomplete                          |
| `pnpm install` in consumer   | `postinstall` runs `agent-loop-doctor --install-check`          |
| Anytime                      | `pnpm exec agent-loop-doctor` — dist + `file:` path diagnostics |


If install fails with a stale partial `dist/` in the pnpm store, rebuild agent-loop and reinstall the consumer (doctor prints exact paths).

Requires **Node.js 22+** for ClinePass.

## Quick start

From any repository root:

```bash
# scaffold profile + example loop
agent-loop-init

# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
# edit .cursor/loops/my-task/GOAL.md + loop.json

doppler run -- agent-check cline
doppler run -- agent-check cursor

# Cursor-only (hackathon / no 3rd-party): Composer 2.5 worker + Grok 4.5 judge
doppler run -- agent-loop run .cursor/loops/my-task --runtime cursor --review-gate

doppler run -- agent-loop run .cursor/loops/my-task --runtime cline-pass
# ClinePass weekly/5h quota exhausted? pay-as-you-go credits:
doppler run -- agent-loop run .cursor/loops/my-task --runtime cline
# (clears leftover cline-pass/* model ids; default deepseek/deepseek-chat)
# optional: --model minimax/minimax-m2.5 --escalate-model google/gemini-2.5-pro
```

Run against another checkout:

```bash
agent-loop run /path/to/zwook/.cursor/loops/fix-foo --repo-root /path/to/zwook
```



## Repo profile

`.cursor/agent-loop.repo.json`:


| Field                        | Purpose                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `taskwarriorProject`         | HITL tasks land here (`dxp`, `zwook`, …) — **required** when using `hitlCheck` |
| `syncCommand`                | Shell command after success (`pnpm tasks:sync` or `null`)                      |
| `defaultBranch`              | Post-loop diff base (`main`)                                                   |
| `agentsFile` / `reviewsFile` | Prompt + review paths                                                          |
| `skillsGlob`                 | System prompt skills hint                                                      |
| `clientName`                 | Cline client label                                                             |


Per-loop overrides in `loop.json`: `taskwarriorProject`, `taskwarriorUuid`, `hitlCheck`.

**Taskwarrior:** use **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` — numeric IDs are recycled (`task <uuid> info`). On loop success with `syncOnSuccess`, the harness marks that UUID done.

## Loop bundle

```
.cursor/loops/my-task/
  GOAL.md                  # frozen spec (+ Taskwarrior UUID for traceability)
  loop.json                # verify command, runtime, taskwarriorUuid (UUID only)
  verify.sh                # measurable shell checks (exit 0 = pass)
  VERIFY.skill.md          # agent-readable verify procedure (optional but recommended)
  log.ndjson               # append-only iteration log
  failure-domains.ndjson   # optional — logged on stagnation / max iterations
  failure-context.md       # optional — written by meta-loop probe for fix loop
```

See [`docs/verification-as-skill.md`](./docs/verification-as-skill.md) for checklist authoring.

`loop.json` legacy field `syncPostgres` maps to `syncOnSuccess`.

### loop.json fields (Ralph extensions)


| Field                          | Default    | Purpose                                                                                                                                                                                  |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                         | `forward`  | `reverse` = clean-room rebuild (see `templates/GOAL.reverse.template.md`)                                                                                                                |
| `pauseAfterIteration`          | `false`    | Wait for Enter after each iteration (verifier failure or review-gate fix round; TTY only)                                                                                                |
| `injectFailureContext`         | `false`    | Read `failure-context.md` into the prompt (meta-loop fix rounds)                                                                                                                         |
| `finalVerify`                  | —          | Stricter outer check after inner `verify` passes (e.g. deploy + smoke)                                                                                                                   |
| `reasoningEffort`              | —          | Cline runtimes (`cline-pass` / `cline`): `low` | `medium` | `high` | `xhigh` | `none`. Starting reasoning tier. `none` disables model-side thinking. Cursor ignores it.                  |
| `escalateReasoningEffort`      | —          | Cline runtimes: ceiling of the reasoning ladder. The harness steps `reasoningEffort` up by `reasoningEscalationStep` tiers each iteration (from iteration 2) until it reaches this tier. |
| `reasoningEscalationStep`      | `1`        | Tiers to step reasoning up per iteration (`1` or `2`).                                                                                                                                   |
| `escalateModelReasoningEffort` | —          | Cline runtimes: reasoning tier to use on the escalated model. Defaults to the ladder ceiling.                                                                                            |
| `escalateAfterStagnation`      | `2`        | Identical-failure stagnation count that triggers the **model** switch — only after reasoning has reached its ceiling (cheap lever first, expensive lever second).                        |
| `runtime`                      | `cursor`   | `cursor` | `cline-pass` (subscription quota) | `cline` (usage-billing credits). **Cursor-only:** worker=`composer-2.5`, judge=`grok-4.5` via `reviewModel`.                              |
| `reviewModel`                  | (see note) | Cursor SDK judge for quality review / review-gate. Default `grok-4.5` when `runtime` is `cursor`, else `composer-2.5`. Allowed: `grok-4.5`, `composer-2.5` (never Fast).                 |
| `reviewReproduce`              | `false`    | Downgrade error+impact blockers lacking a citeable path in the merge-base…working-tree changed set (committed + staged + unstaged). Skipped if that set is empty.                      |


CLI overrides: `--mode reverse`, `--pause-after-iteration`.

**Library note:** `reviewVerdictAllowsCompletion` takes a full `ParsedReview` (not a bare verdict string) so impact-severity gating can run.

## Ralph loop alignment

This tool implements the [Ralph loop](https://ghuntley.com/loop/) pattern Geoffrey Huntley describes:

- **Monolithic** — one repo, one process, one task per loop (no multi-agent mesh)
- **Fresh context** each iteration; progress lives in **files and git**, not the context window
- **Shell backpressure** (`verify` / `finalVerify`) as the deterministic judge
- **Verification-as-skill** — pair `verify.sh` with `VERIFY.skill.md` for quantitative checks ([guide](./docs/verification-as-skill.md))
- **Watch the loop** — `log.ndjson`, stagnation detection, optional `--pause-after-iteration`
- **Failure domains** — `failure-domains.ndjson` on stagnation, max iterations, or review-gate exhaustion
- **Meta-loop** — probe → write `failure-context.md` → fix → re-probe (see below)

Forward mode (`mode: forward`) is incremental fix-until-green. Reverse mode (`mode: reverse`) adds clean-room prompt guidance — agents can still read the repo; enforce scope via `verify` and GOAL.md.

## Meta-loop (probe → fix → re-probe)

For system-level verification with automatic fix spawning, use `metaLoop` in `loop-batch.json` instead of a plain `loops` array:

```json
{
  "metaLoop": {
    "probe": "system-smoke",
    "fix": "fix-from-smoke",
    "maxCycles": 3
  },
  "hitlCheck": "Manual QA after meta-loop",
  "taskwarriorProject": "loops"
}
```

Cycle: run **probe** loop → on failure, write `failure-context.md` to the **fix** bundle → run **fix** with `injectFailureContext` → re-run probe. Stops when probe passes or `maxCycles` is exhausted.

See `templates/loop-batch.meta.example.json`.

## CLIs


| Command                    | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| `agent-loop run <dir>`     | Single loop                                                     |
| `agent-loop-batch <dir>`   | `loop-batch.json` sequential or meta-loop runs                  |
| `agent-check cursor|cline` | SDK + API key smoke                                             |
| `agent-loop-init`          | Scaffold templates                                              |
| `agent-loop-doctor`        | Validate `dist/` + `file:` checkout path (consumer postinstall) |




## Consumer `package.json` scripts

**Maxin:**

```json
{
  "scripts": {
    "agent:loop": "doppler run --project maxin_dxp --config dev -- agent-loop run",
    "agent:check": "doppler run --project maxin_dxp --config dev -- agent-check cline"
  }
}
```

Profile: `"syncCommand": "pnpm tasks:sync"`, `"taskwarriorProject": "dxp"`.

**Zwook:**

```json
{
  "scripts": {
    "agent:loop": "doppler run --project zwook --config dev -- agent-loop run"
  }
}
```

Profile: `"taskwarriorProject": "zwook"`, `"syncCommand": null`.

## Architecture

```
GOAL.md + loop.json → fresh agent → shell verify (exit 0?) → optional review gate → log.ndjson → repeat
```

Post-success (optional): Cursor quality review (`composer-2.5` only — **not** Composer Fast) → `review.md`. With `reviewGate: true`, verdict **BLOCKERS** or an **unparseable verdict** injects blockers into the next iteration (up to `maxReviewCycles`); loop completes only on **PASS** or **ADVISORY**. Without the gate, review is advisory only and UNKNOWN is non-blocking. Then: `task uuid:… done` → HITL task → `syncCommand`.

On finish, stderr prints token totals, estimated USD, and (for ClinePass) cached-input token counts (`usage: … in / … out | cache R … / W … | ~$…`) from ClinePass `getAccumulatedUsage` (official rates for DeepSeek v4 Flash; Composer 2.5 when token data is available). Cached-input tokens are billed at a discount by the provider; the shown cost already reflects that discount for ClinePass, while estimated costs (Cursor / missing provider cost) do not subtract cache savings.


| Layer                          | Role                                            | Blocks loop? |
| ------------------------------ | ----------------------------------------------- | ------------ |
| Shell `verify` / `finalVerify` | Judge — deterministic                           | Yes          |
| `postQualityReview` (no gate)  | Sensor — advisory LLM                           | No           |
| `reviewGate: true`             | Sensor + gate on BLOCKERS / unparseable verdict | Yes          |


For a comprehensive technical deep-dive, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Threat model

The harness is designed for **trusted checkouts** you control:

- **`loop.json` `verify` / `finalVerify`** and the repo profile **`syncCommand`** run via `shell: true` in the target repo. A malicious or compromised config can execute arbitrary shell.
- **Verifier stdout/stderr** is injected verbatim into the next agent prompt (with soft guardrails only). Untrusted verifier output can attempt prompt injection.
- On start, the CLI prints configured shell commands to stderr and flags obvious exfil patterns (`curl`, `wget`, `| sh`, backticks, `$()`).

Only run `agent-loop` in repos and loop bundles you trust. Review `loop.json` and `.cursor/agent-loop.repo.json` before the first run on an unfamiliar checkout.

## Telegram completion reports

When a loop or batch finishes (success **or** failure), the CLI can send a short report to your Telegram:

- Status, repo, bundle/batch path, iterations, completion reason
- Token/cost usage line (same as stderr)
- Review verdict when `review.md` exists
- Last verifier output snippet on failure

When a post-loop review exists (`review.md` or `review.N.md`), a **second Telegram message** delivers the full markdown file as a document (caption = bundle path). Opt out with `"telegramAttachReview": false` in `loop.json` or `"attachReview": false` under `telegramNotify` in the repo profile.

**Setup (per consumer repo):**

1. Create a bot via [@BotFather](https://t.me/BotFather); store the token in Doppler (never commit):
  - `AGENT_LOOP_TELEGRAM_BOT_TOKEN` (preferred) or `TELEGRAM_BOT_TOKEN`
2. Your chat id — either env `AGENT_LOOP_TELEGRAM_CHAT_ID` or in `.cursor/agent-loop.repo.json`:

```json
{
  "telegramNotify": {
    "chatId": "YOUR_CHAT_ID",
    "onSuccess": true,
    "onFailure": true
  }
}
```

3. Maxin/Zwook already wrap loops in `doppler run …` — add those secrets to the same Doppler project/config the loop scripts use.

**Opt out:** `"notifyTelegram": false` in `loop.json` / `loop-batch.json`, or CLI `--no-telegram`.

Notify is **non-blocking** — API errors log to stderr and do not change the loop exit code.

## License

MIT
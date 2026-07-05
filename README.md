# @dancingteeth/agent-loop

Repo-agnostic **fix-until-green** agent loop: fresh agent context per iteration, shell verifier, `log.ndjson`, optional Taskwarrior hooks.

Supports **Cursor SDK** (`composer-2.5`) and **ClinePass** (`cline-pass/deepseek-v4-flash`, etc.).

## Install

```bash
pnpm add -D @dancingteeth/agent-loop @cline/sdk
# optional, for post-loop review:
pnpm add -D @cursor/sdk
```

Or link during development:

```bash
cd ~/Projects/agent-loop && pnpm link --global
cd ~/Projects/zwook && pnpm link -g @dancingteeth/agent-loop
```

Requires **Node.js 22+** for ClinePass.

## Quick start

From any repository root:

```bash
# scaffold profile + example loop
agent-loop-init

# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
# edit .cursor/loops/my-task/GOAL.md + loop.json

doppler run -- agent-check cline
doppler run -- agent-loop run .cursor/loops/my-task --runtime cline-pass
```

Run against another checkout:

```bash
agent-loop run /path/to/zwook/.cursor/loops/fix-foo --repo-root /path/to/zwook
```

## Repo profile

`.cursor/agent-loop.repo.json`:

| Field | Purpose |
|-------|---------|
| `taskwarriorProject` | HITL tasks land here (`dxp`, `zwook`, …) |
| `syncCommand` | Shell command after success (`pnpm tasks:sync` or `null`) |
| `defaultBranch` | Post-loop diff base (`main`) |
| `agentsFile` / `reviewsFile` | Prompt + review paths |
| `skillsGlob` | System prompt skills hint |
| `clientName` | Cline client label |

Per-loop overrides in `loop.json`: `taskwarriorProject`, `taskwarriorUuid`, `hitlCheck`.

## Loop bundle

```
.cursor/loops/my-task/
  GOAL.md                  # frozen spec
  loop.json                # verify command, runtime, model, TW uuid
  log.ndjson               # append-only iteration log
  failure-domains.ndjson   # optional — logged on stagnation / max iterations
  failure-context.md       # optional — written by meta-loop probe for fix loop
```

`loop.json` legacy field `syncPostgres` maps to `syncOnSuccess`.

### loop.json fields (Ralph extensions)

| Field | Default | Purpose |
|-------|---------|---------|
| `mode` | `forward` | `reverse` = clean-room rebuild (see `templates/GOAL.reverse.template.md`) |
| `pauseAfterIteration` | `false` | Wait for Enter after each iteration (verifier failure or review-gate fix round; TTY only) |
| `injectFailureContext` | `false` | Read `failure-context.md` into the prompt (meta-loop fix rounds) |
| `finalVerify` | — | Stricter outer check after inner `verify` passes (e.g. deploy + smoke) |

CLI overrides: `--mode reverse`, `--pause-after-iteration`.

## Ralph loop alignment

This tool implements the [Ralph loop](https://ghuntley.com/loop/) pattern Geoffrey Huntley describes:

- **Monolithic** — one repo, one process, one task per loop (no multi-agent mesh)
- **Fresh context** each iteration; progress lives in **files and git**, not the context window
- **Shell backpressure** (`verify` / `finalVerify`) as the deterministic judge
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

| Command | Description |
|---------|-------------|
| `agent-loop run <dir>` | Single loop |
| `agent-loop-batch <dir>` | `loop-batch.json` sequential or meta-loop runs |
| `agent-check cursor\|cline` | SDK + API key smoke |
| `agent-loop-init` | Scaffold templates |

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

Post-success (optional): Cursor quality review (`composer-2.5` only — **not** Composer Fast) → `review.md`. With **`reviewGate: true`**, verdict **BLOCKERS** injects blockers into the next iteration (up to `maxReviewCycles`); loop completes only on PASS/ADVISORY/UNKNOWN. Without the gate, review is advisory only. Then: `task uuid:… done` → HITL task → `syncCommand`.

On finish, stderr prints token totals and estimated USD (`usage: …`) from ClinePass `getAccumulatedUsage` (official rates for DeepSeek v4 Flash; Composer 2.5 when token data is available).

| Layer | Role | Blocks loop? |
|-------|------|--------------|
| Shell `verify` / `finalVerify` | Judge — deterministic | Yes |
| `postQualityReview` (no gate) | Sensor — advisory LLM | No |
| `reviewGate: true` | Sensor + gate on BLOCKERS verdict | Yes |

## Telegram completion reports

When a loop or batch finishes (success **or** failure), the CLI can send a short report to your Telegram:

- Status, repo, bundle/batch path, iterations, completion reason
- Token/cost usage line (same as stderr)
- Review verdict when `review.md` exists
- Last verifier output snippet on failure

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

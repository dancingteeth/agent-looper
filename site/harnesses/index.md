# Harnesses

Agent Looper ships worker runtimes for the coding agents you already pay for. Each block is one shipped runtime — plus Grok Bot, which is an operator, not a `--runtime` value. Facts come from published repo docs and CLI help.

## Cursor

Cursor is an IDE subscription. Agent Looper drives it through `@cursor/sdk` with `--runtime cursor`.

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper @cursor/sdk`
2. Export `CURSOR_API_KEY`, or run under Doppler.
3. Initialize: `pnpm exec agent-loop-init`
4. Freeze `GOAL.md` and `verify.sh`.
5. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate`

### Models

- Worker: `composer-2.5`
- Judge (when worker is Cursor): Grok 4.6

Set `costPreset: "cursor"` in `loop.json` to stay on Cursor for both worker and judge.

## Grok Bot

Runs Agent Looper on your computer. Frozen goal, determined check, fresh worker every round.

[Add to Grok Bot](https://x.ai/bot/AETdGbRRNWfckrRGv22LD)

Grok Bot is the Grok operator that runs Agent Looper on the user's computer. It is not a `--runtime` enum value. Distinct from the Grok 4.6 model that Cursor uses as judge.

### How to use

1. Freeze `GOAL.md` and `verify.sh`.
2. From the Grok Bot session, start the harness: `pnpm exec agent-loop run .cursor/loops/my-task --review-gate`
3. Worker and judge come from `loop.json` and what's installed. There is no `--runtime grok`.

The harness still owns the determined check and a fresh worker each iteration. Grok Bot starts that loop; it does not implement the goal itself.

## DSH

DSH is the DeepSeek Harness CLI. Agent Looper ships a `dsh` worker runtime and a `dsh-agent-looper` plugin for `dsh web`. See [docs/dsh-plugin.md](https://github.com/dancingteeth/agent-looper/blob/main/docs/dsh-plugin.md) and [plugins/dsh-agent-looper/](https://github.com/dancingteeth/agent-looper/tree/main/plugins/dsh-agent-looper).

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper`; ensure `dsh` is on PATH.
2. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime dsh --review-gate`. The worker process is `dsh --profile headless`.
3. For `dsh web`, build the plugin (`pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json`) and add it (`dsh plugin --profile web add ./plugins/dsh-agent-looper`).

### Models

- Worker: `deepseek-official/deepseek-v4-flash` (escalates to `deepseek-official/deepseek-v4-pro`)
- Judge: `deepseek-official/deepseek-v4-pro` (when `reviewRuntime: dsh`)

## Cline

Cline runs through `@cline/sdk`. Two runtime values: `cline-pass` (subscription quota) and `cline` (credits).

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper @cline/sdk`
2. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime cline-pass --review-gate` (or `--runtime cline` for credits)

### Models

- `cline-pass` worker: `cline-pass/deepseek-v4-flash` → `qwen3.7-plus`
- `cline` worker: `deepseek/deepseek-chat` → `qwen/qwen3-coder-plus`
- Judge: Cursor Composer 2.5 (unless `reviewRuntime` is set)

## OpenCode

OpenCode runs through `@opencode-ai/sdk` and the `opencode` CLI. Go quota by default, or BYOK through OpenRouter, Vercel AI Gateway, Ollama, or another OpenAI-compatible router.

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper @opencode-ai/sdk`; ensure `opencode` CLI is on PATH.
2. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime opencode --review-gate`

### Models

- Go worker: `opencode-go/deepseek-v4-flash` → `qwen3.7-plus`
- BYOK: `openrouter/…`, `vercel/…`, `ollama/…`
- Judge: Cursor, or `reviewRuntime: opencode` (DeepSeek V4 Pro)

## Pi

Pi runs through `@earendil-works/pi-coding-agent`. OpenRouter by default, or another OpenAI-compatible router you configure.

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper @earendil-works/pi-coding-agent`
2. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime pi --review-gate`

### Models

- Worker: `openrouter/deepseek/deepseek-chat` → `openrouter/qwen/qwen3-coder-plus`
- Judge: Cursor, or `reviewRuntime: pi`

## Codex

Codex runs through `@openai/codex-sdk` and the `codex` CLI. ChatGPT / OpenAI BYO.

### How to use

1. Install: `pnpm add -D @dancingteeth/agent-looper @openai/codex-sdk`; ensure `codex` CLI is on PATH.
2. Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime codex --review-gate`

### Models

- Worker: `gpt-5.6-luna` → `gpt-5.6-terra`
- Judge: Cursor, or `reviewRuntime: codex` (default judge `gpt-5.6-sol`)

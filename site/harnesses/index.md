# Harnesses

Agent Looper ships worker runtimes for the coding agents you already pay for. **Operators** start the loop on your machine; **runtimes** are the `--runtime` values the harness drives. Facts come from published repo docs and CLI help.

## Operator — Agent Looper Grok Bot

![Grok Bot operator](../logos/looper-bot.png)

You say what to build and how to know it's done. It keeps a coding agent working on your computer until that check passes.

[Add to Grok Bot](https://x.ai/bot/AETdGbRRNWfckrRGv22LD)

Grok Bot is the Grok operator that runs Agent Looper on the user's computer. It is not a `--runtime` enum value. Distinct from the Grok 4.6 model that Cursor uses as judge.

### How to use

1. Freeze `GOAL.md` and `verify.sh`.
2. From the Grok Bot session, start the harness: `pnpm exec agent-loop run .cursor/loops/my-task --review-gate`
3. Worker and judge come from `loop.json` and what's installed. There is no `--runtime grok`.

The harness still owns the determined check and a fresh worker each iteration. Grok Bot starts that loop; it does not implement the goal itself.

## Runtimes

Install once: `pnpm add -D @dancingteeth/agent-looper`, then add the SDK or CLI named on each card.

### Cursor (`--runtime cursor`)

IDE subscription via `@cursor/sdk`.

- Worker: `composer-2.5`
- Judge (when worker is Cursor): Grok 4.6
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime cursor --review-gate`

Export `CURSOR_API_KEY` or run under Doppler. Run `pnpm exec agent-loop-init` once. Set `costPreset: "cursor"` in `loop.json` to stay on Cursor for both worker and judge.

### DSH (`--runtime dsh`)

DeepSeek Harness CLI — worker is `dsh --profile headless`; `dsh-agent-looper` plugin for `dsh web`. See [docs/dsh-plugin.md](https://github.com/dancingteeth/agent-looper/blob/main/docs/dsh-plugin.md) and [plugins/dsh-agent-looper/](https://github.com/dancingteeth/agent-looper/tree/main/plugins/dsh-agent-looper).

- Worker: `deepseek-official/deepseek-v4-flash` (escalates to `deepseek-official/deepseek-v4-pro`)
- Judge: `deepseek-official/deepseek-v4-pro` (when `reviewRuntime: dsh`)
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime dsh --review-gate`

### Cline (`--runtime cline-pass` · `cline`)

`@cline/sdk` — `cline-pass` for subscription quota, `cline` for credits.

- `cline-pass` worker: `cline-pass/deepseek-v4-flash` → `qwen3.7-plus`
- `cline` worker: `deepseek/deepseek-chat` → `qwen/qwen3-coder-plus`
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime cline-pass --review-gate` (or `--runtime cline` for credits)

### OpenCode (`--runtime opencode`)

`@opencode-ai/sdk` and `opencode` CLI — Go quota by default, or BYOK through OpenRouter, Vercel AI Gateway, Ollama, or another OpenAI-compatible router.

- Go worker: `opencode-go/deepseek-v4-flash` → `qwen3.7-plus`
- BYOK: `openrouter/…`, `openrouter/…:free`, `vercel/…`, `ollama/…`
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime opencode --review-gate`

### Pi (`--runtime pi`)

`@earendil-works/pi-coding-agent` — OpenRouter by default, or another OpenAI-compatible router you configure.

- Worker: `openrouter/deepseek/deepseek-chat` → `openrouter/qwen/qwen3-coder-plus`
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime pi --review-gate`

### Codex (`--runtime codex`)

`@openai/codex-sdk` and `codex` CLI — ChatGPT / OpenAI BYO.

- Worker: `gpt-5.6-luna` → `gpt-5.6-terra`
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime codex --review-gate`

### Muse (`--runtime muse`)

`@muse-code/sdk` and `muse` CLI — Meta Muse Code. Not on `costPreset` minmax. See [docs/muse-runtime.md](https://github.com/dancingteeth/agent-looper/blob/main/docs/muse-runtime.md).

- Worker: `muse-spark-1.3-contributor` (climb `reasoningEffort`; no stronger Spark slug)
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime muse --review-gate`

### Claude (`--runtime claude`)

PATH `claude` CLI — Claude Code subscription. `--safe-mode` so the harness prompt is the only instruction source (strips project hooks and auto-memory). Not on `costPreset` minmax. See [docs/claude-runtime.md](https://github.com/dancingteeth/agent-looper/blob/main/docs/claude-runtime.md).

- Worker: `sonnet` → `opus`
- Judge: any runtime, optional
- Run: `pnpm exec agent-loop run .cursor/loops/my-task --runtime claude --review-gate`

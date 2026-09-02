---
tags:
  - documentation
  - runtimes
  - claude
  - cost
  - agents
---
# Claude Code worker runtime

`runtime: claude` spawns the **`claude` CLI** already on PATH: one `claude -p` process **per outer-loop iteration**. There is no `@anthropic-ai/claude-agent-sdk` dependency on the Agent Looper package.

Each spawn uses `--safe-mode` (Claude Code **2.1.169+**) so `CLAUDE.md`, hooks, plugins, MCP, skills, and auto-memory do **not** load. `--no-session-persistence` skips the resumable `-p` transcript. `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` is set on the child. Interactive `claude` on your machine is unchanged.

The child **unsets `ANTHROPIC_API_KEY`** so print mode uses Claude Code login (Pro/Max/Team Premium), not Console pay-per-token. Do not set that key in the grind shell if you want subscription quota.

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "claude"` to judge with Claude too (default **`opus`**). Typical mix: cheap worker (OpenCode Hy3 / DSH Flash) + Claude judge.

Not on `costPreset` minmax — Sonnet/Opus are not Flash-class cheap. Use an explicit `runtime` / `reviewRuntime`.

## Call shape

```bash
unset ANTHROPIC_API_KEY
CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 claude -p "<iteration prompt>" \
  --output-format json \
  --permission-mode bypassPermissions \
  --no-session-persistence \
  --safe-mode \
  --model sonnet \
  --append-system-prompt "<harness AGENTS.md + loop system prompt>"
```

Stdout is Claude's JSON result (`result`, `usage`, `total_cost_usd`, `session_id`). Nonzero exit or `is_error` fails the iteration. The harness waits on process **`close`**, then SIGTERMs the process group on the 45-minute cap (SIGKILL after 3s).

`--bare` is **not** used: that mode does not read subscription credentials.

## Install

```bash
# Claude Code CLI 2.1.169+ on PATH (`claude update` if you are behind)
claude login    # once, interactive — persist ~/.claude
# this checkout:
node dist/cli/check.js claude
# consumer:
pnpm exec agent-check claude
```

`agent-check claude` does **not** spend quota. It checks PATH, version, and `--safe-mode`. If `ANTHROPIC_API_KEY` is set, it warns that the loop will ignore it.

The loop does not depend on you having run that check: `runtime: claude` re-probes `claude --version` once at session start and aborts before the first iteration if the CLI is missing or below 2.1.169, so a stale binary fails with `claude update` guidance instead of an opaque flag-parse error mid-grind.

## Defaults

| Field | Default |
| --- | --- |
| `model` | `sonnet` |
| `escalateModel` | `opus` |
| `reviewModel` (when `reviewRuntime: "claude"`) | `opus` |

Setup also lists **`fable`** (hard-project / long-horizon judge) and **`haiku`**. Full `claude-…` ids your account accepts are valid in `loop.json`. Aliases follow Claude Code (`sonnet`, `opus`, `haiku`, `fable`, …).

## Auth

1. `claude login` (subscription — Pro, Max, Team **Premium**, or Enterprise). Team Standard seats do not include Claude Code.
2. Persist `~/.claude/` (and macOS Keychain). Do not re-login per iteration.
3. Leave `ANTHROPIC_API_KEY` unset in the grind environment.

Headless usage draws from the **same weekly / 5-hour quota** as interactive Claude Code. Overnight parallel workers can empty a Max plan; that is the operator’s choice, not a harness cap.

## Example

Hy3 worker, Claude Opus judge:

```json
{
  "runtime": "opencode",
  "model": "opencode-go/hy3",
  "reviewRuntime": "claude",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

Claude worker + Claude judge:

```json
{
  "runtime": "claude",
  "reviewRuntime": "claude",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

## How to test

**CI / no live Claude spend**

- `pnpm exec vitest run src/agents/claudeAgent.test.ts`
- `pnpm exec vitest run src/agents/agentRunner.test.ts src/loop/loopAgentConfig.test.ts`

**Live (manual)**

- `agent-check claude` then a one-iteration smoke with `reviewGate: false`
- Confirm `/login` is done; a print that says `Please run /login` is auth, not a bad GOAL

## Related

- Runtime map: [`runtime-map.md`](./runtime-map.md)
- Claude Code CLI: https://code.claude.com/docs/en/cli-reference

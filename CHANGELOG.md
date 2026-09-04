---
tags:
  - documentation
  - releasing
---
# Changelog

Notable changes to `@dancingteeth/agent-looper`. Dates are UTC.

## 0.5.0 — 2026-09-04

Fix-until-green with a prompt TUI, Claude Code as a first-class runtime, list-vs-billed spend, and a documented embed contract.

### Headline

- **`agent-loop-prompt`** — Ink TUI: type an idea; the **judge** (not the worker) drafts `GOAL.md` + `verify.sh`; freeze lint rejects gameable greps; confirm; existing watch TUI grinds. Optional `preview` after green is trust-gated and is **not** executed by `agent-loop run`. Resume lines keep Doppler when the shell was started that way.
- **Claude Code worker and judge** — `runtime: claude` / `reviewRuntime: claude` spawn PATH `claude -p` once per outer iteration under `--safe-mode` (CLI 2.1.169+). No `CLAUDE.md`, hooks, plugins, MCP, skills, or auto-memory. `--no-session-persistence` plus `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Child unsets `ANTHROPIC_API_KEY` so print mode uses Claude Code login, not Console pay-per-token. Worker default sonnet (escalate opus); Claude judge default opus. Not on `costPreset` minmax. No `@anthropic-ai/claude-agent-sdk` on the CLI package. See [`docs/claude-runtime.md`](./docs/claude-runtime.md).
- **List vs billed spend** — Watch and run-report show **list** (public API rates, including prompt-cache read/write) and **billed** (runtime invoice). Subscription quota `$0` is billed `$0`, not free; `maxCostUsd` uses billed when PAYG and list when the invoice is `$0`. DSH headless usage is parsed from session JSONL (including logs that grow in place).
- **Embed contract + security policy** — [`docs/embed-api.md`](./docs/embed-api.md) names stable vs experimental exports, Portal-storable shapes, ADE composition, and a hard-to-rewrite bill of materials. `AgentLoopPhase` / `AgentLoopPhaseEvent` are re-exported from the package entry. [`SECURITY.md`](./SECURITY.md): `security@dancingteeth.net` and GitHub private vulnerability reporting. Supported line: **0.5.x** only.

### Also

- OpenRouter `:free` slugs as valid OpenCode BYOK worker ids; setup labels hosted-$0 stacks.
- Review gate treats `BLOCKERS` with an empty list as unparseable, not a silent pass. Verify spawn buffer no longer kills a passing oversized log.
- Hosts can pass `workerSession` into `runAgentLoop` (still disposed at end of run).
- Muse Spark **1.3** is the setup/docs default (1.2 stays as a prior pick). Contributor vs PAYG is billing, not a worker/judge pair.
- Watch TUI: live assistant stream + pid pulse; OpenCode tools in the run report; `check-running-loops` distinguishes alive / stale / hung / dead / done.
- OpenCode skill preflight relinks or drops dangling `~/.agents/skills` symlinks after Cursor plugin-cache rotations.
- Competitive-steal planning notes are gitignored and no longer ship in the tarball.
- Publish CI runs on Node **22.15** (DSH `zlib.zstd*`).

### Compatibility

- Claude Code **2.1.169+** required for `runtime: claude`.
- Default `costPreset` is still minmax.
- Phase events stay **Experimental** (no `schemaVersion` yet). No thin-core `package.json` export subpath.
- Pre-0.5.0 lines are unsupported for security fixes.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.5.0)

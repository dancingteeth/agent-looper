---
tags:
  - documentation
  - releasing
---
# Changelog

Notable changes to `@dancingteeth/agent-looper`. Dates are UTC.

## Unreleased

- **Frozen files also cover creation** — a worker that *adds* a frozen basename (`setup.sh`, `RESEARCH.md`, …) that did not exist at loop start now has it removed on restore and the visit fails, closing the cross-run persistence path where a planted `setup.sh` would be auto-selected by the next `agent-loop run`.
- **Runtime spec table** — per-runtime defaults, model-shape validation, and capability flags (`honorsReasoningEffort`, `offersEscalateModel`) live in one `RUNTIME_SPEC` table (`src/loop/runtimeSpec.ts`). Invalid-model errors now read `Invalid <field> "<slug>" for <runtimeField> "<runtime>". <hint>`; the zod issue path comes from the typed `AgentModelError.field` instead of message sniffing. Public exports from `loopAgentConfig` are unchanged.
- **Docs** — DSH companion bash guard documented as a best-effort tripwire (not a sandbox); README states the shell-trust default is warn-and-run.

## 0.6.0 — 2026-09-11

Single-screen setup wizard, DeepSeek 4.1 Flash on the DSH runtime, a hardened DSH companion guard, and harness control-plane gates.

### Headline

- **Single-screen setup wizard** — one persistent Ink render shows the recap plus the current question instead of appending a block per prompt. Back re-asks one step; the review screen re-asks one row and keeps the rest, dropping disabled-branch answers (Telegram, Taskwarrior UUID). A re-asked row starts on your previous answer, so Enter keeps it. `--plain` / `--answers` unchanged.
- **DeepSeek 4.1 Flash on the DSH runtime** — `deepseek-official/deepseek-flash` (the DSH `DeepSeek-V41-Flash` catalog row, image-capable by default) joins the setup menu, usage pricing, and [`docs/dsh-runtime.md`](./docs/dsh-runtime.md). The pinned `deepseek-v4-flash` stays the DSH worker default; opt in per loop.
- **DSH companion guard hardening** (`@dancingteeth/dsh-agent-looper`) — the bash guard denies *foreground* grind launches: `agent-loop run` and bare `agent-loop <loop-dir>`, `agent-loop-batch`, `node dist/cli/run.js` / `./dist/cli/run.js`, and `tsx src/cli/run.ts`, whether started via `npx` / `pnpm exec` / `pnpm agent-loop` / `node_modules/.bin`, behind `doppler run … --`, `sudo -u`, `env -i`, `timeout`, or `nice`, inside subshells or `if` / `then` bodies, through `$()` / backtick substitution or `bash -c` / `-lc` / `--login -c`, or in executed heredocs. It also blocks secret copy-outs (`cp` / `mv` / `rsync` / `install`, `< file` redirects) and env dumps (`doppler run … -- env` / `printenv`, `doppler configure`), while allowing commands that merely *mention* the CLI (`rg`, `git log --grep`, `sed`, single-quoted text, doc-writing heredocs). Registrations are released through `ctx.effect`, and CI now compiles the plugin.
- **Env vs product verify** — `verify.sh` exit `75` (`EX_TEMPFAIL`), exit `127` (command not found), or a `VERIFY_CLASS=env` line parks the loop (`status: waiting`, HITL) instead of sending another worker. Other non-zero exits stay product failures and keep iterating. `VerifyResult.verifyClass` is `ok` \| `product` \| `env`. `deriveLoopRunStatus` maps env-class `lastVerify` / failed `setup` to `waiting`.
- **Harness setup** — optional `loop.json` `setup`, or `setup.sh` beside `GOAL.md`. Runs once, awaited, before the first worker. Evidence in `setup.log` / `run-report.md`. Failure does not spawn a worker and restores frozen spec files if setup mutated them.
- **Frozen files** — after each visit the harness restores `GOAL.md`, `loop.json`, `verify.sh`, `VERIFY.skill.md`, `RESEARCH.md`, `PERMISSIONS.md`, and `setup.sh` if a worker edited them, and fails that visit.

### Also

- Guard false positives fixed: reading or editing text that contains `agent-loop run` no longer gets denied, `$()` / backticks inside single quotes are treated as text, and `agent-loop watch` / `command -v agent-loop` stay allowed.
- A missing `skillsDir` warns through `ctx.logger` instead of silently registering zero skills.
- Both frozen guard probes (44 + 66 cases) run in the DSH plugin loop's `verify.sh`; the plugin's unit tests run in `pnpm test`.
- `agent-loop-batch` lists each loop's `verify` / `finalVerify` / `setup` in the shell-trust warning (same gate as a single `agent-loop run`).
- Judge prompts fence the goal, diff stat, and `REVIEWS.md` as data, so instructions injected into them cannot steer the verdict.
- With `reviewGate` on, the configured secondary judge always runs instead of being skipped on a primary PASS.
- Log-append, Cline usage, and OpenCode permission-reply failures are logged instead of thrown or swallowed.
- Supported line: **0.6.x**.

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

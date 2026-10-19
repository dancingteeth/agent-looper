---
tags:
  - documentation
  - releasing
  - agents
  - agentic_ai
  - type/app
---
# Changelog

Notable changes to `@dancingteeth/agent-looper`. Dates are UTC.

## Unreleased

## 0.7.5 — 2026-10-19

OpenCode gets a companion plugin, and harness workers can tell it apart from your own sessions.

### Headline

- **OpenCode companion plugin** — new package [`@dancingteeth/opencode-agent-looper`](https://www.npmjs.com/package/@dancingteeth/opencode-agent-looper) (`plugins/opencode-agent-looper/`), for OpenCode 1.x and 2.x from one default export. Install it with `opencode plugin add @dancingteeth/opencode-agent-looper` on 2.x, or under the `plugin` key in `opencode.json` on 1.x. It ships the `design-loop` / `review-gate` / `check-running-loops` / `run-loop-in-opencode` skills, `agent_loop_start` (runs `agent-loop run` detached so the shell timeout cannot kill it), `agent_loop_status` (reads the `AGENT_LOOP_DONE` JSON, so a capped or failed run is not reported as complete), and a guard that rejects a foreground `agent-loop run` in the shell tool.
- **`AGENT_LOOP_WORKER=1` on harness-spawned `opencode serve`** — with the plugin installed globally, a `runtime: opencode` worker or judge keeps only the guard. It is not given tools to start nested grinds.
- **`agent-loop-init` ignores `opencode-grind.log` / `opencode-grind.pid`** — the plugin writes them in the loop dir. Repos initialised before 0.7.5 keep their existing ignore block; add the two lines by hand.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.5)

## 0.7.4 — 2026-10-19

`runtime: opencode` works with the OpenCode 2.x CLI. A repo without a local `opencode-ai` pin used to fall back to a 2.x `opencode` on PATH and time out at server start.

### Headline

- **OpenCode 2.x support** — the harness runs `opencode --version` on the resolved binary (repo `node_modules/opencode-ai` first, then PATH) and talks to a 2.x server through `@opencode/client`; 1.x keeps `@opencode-ai/sdk` unchanged. 2.x replaced the server API (Basic auth, new routes, `session.execution.*` instead of `session.idle`), so the 1.x SDK cannot drive it. With a 2.x CLI, add `pnpm add -D @opencode/client`; without it the loop fails with that install hint instead of a 30s timeout.
- **2.x provider keys use OpenCode's credential store** — OpenCode migrates v1 `auth.json` on first boot; `OPENCODE_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY` are added once, not on every run.
- **`agent-check opencode` does a real serve handshake** — it starts a throwaway server and makes one authenticated call with the matching client, so an SDK/CLI mismatch fails the check instead of the first loop. It used to pass on `opencode --version` alone.
- **`opencode-go/kimi-k3` is back on the Go catalog** — the 0.7.2 exclusion was wrong: OpenCode Go does offer Kimi K3. The slug returns to `OPENCODE_GO_LOOP_MODELS` and the pricing map ($3/$15, cache-read $0.30), so the setup wizard offers it again and budget caps price it. `EXCLUDED_MODEL_SLUGS` stays as the escape hatch, now empty.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.4)

## 0.7.3 — 2026-10-15

The OpenCode Go catalog re-syncs to models.dev: the deprecated DeepSeek V4 Flash rows drop out, two new rows arrive, and `pnpm sync:models:check` goes green again.

### Headline

- **Go drops the deprecated Flash slugs** — models.dev now marks `opencode-go/deepseek-v4-flash` and `opencode-go/deepseek-v4-flash-vision-exp` as `deprecated`, so the sync leaves them out. Go slugs stay soft-gated by shape: a loop still pinned to either one keeps running, but the slug is unpriced (`$0` in the report) and budget caps reject it as an unpriced worker or escalate model. Move to `opencode-go/deepseek-v4.1-flash` (the default) or `opencode-go/deepseek-v4-pro`.
- **Go adds `gemini-4-argon-contributor` and hosted-$0 `cat-jam-free`** — Gemini 4 Argon is contributor tier at $4/$20 with a 1M context; Cat Jam is text-only reasoning with tool calling at $0. Both show up in the setup wizard with prepared blurbs. Neither is a worker or judge default, and minmax still skips Gemini.
- **`pnpm sync:models:check` is green** — it had reported drift since the last catalog commit (`cat-jam-free` / `gemini-4-argon-contributor` in, deprecated Flash slugs out).

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.3)

## 0.7.2 — 2026-10-14

The OpenCode Go catalog stops offering Kimi K3, and the models.dev sync gains a curated exclusion list so the weekly re-sync cannot put the slug back.

### Headline

- **`opencode-go/kimi-k3` is off the Go catalog** — OpenCode Go does not offer Kimi K3, but models.dev still publishes it, so every `pnpm sync:models` run (and the weekly CI PR) would keep re-adding it. A new `EXCLUDED_MODEL_SLUGS` set in `scripts/sync-model-catalog.mjs` drops a slug from both the model list and the pricing map, so `agent-loop-doctor` sees no stale price row. Cline Pass keeps `cline-pass/kimi-k3`, and Go slugs stay soft-gated by shape — a loop already pinned to `opencode-go/kimi-k3` still runs, it is just no longer offered in the setup wizard.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.2)

## 0.7.1 — 2026-10-12

Claude alias pricing tracks the CLI's per-endpoint alias map (Haiku 5.5 / Sonnet 5.5 / Opus 5.5 on the Anthropic API), DSH / Codex / OpenRouter list prices re-sync to models.dev, and the OpenCode Go catalog picks up the new rows.

### Headline

- **Claude alias pricing tracks the CLI per endpoint** — on the Anthropic API, `haiku` resolves to Haiku 5.5 ($0.10/$0.50), `sonnet` to Sonnet 5.5 (cache-read 0.1), and `opus` to Opus 5.5 ($4/$20). Estimates still priced the 4.5/5-era rates, so `maxCostUsd` could stop haiku loops ~10x early. On Bedrock / Vertex (`CLAUDE_CODE_USE_BEDROCK` / `CLAUDE_CODE_USE_VERTEX`), `haiku` and `sonnet` still resolve to 4.5, and estimates price them accordingly.
- **OpenCode Go catalog re-sync (models.dev)** — Go adds `claude-haiku-5-5`, `space-bunny` (replaces the delisted `space-bunny-free`), and hosted-$0 `longcat-2.5-preview-free` / `step-5-preview-free`; drops delisted `glm-5.1`, `kimi-k2.6`, `qwen3.6-plus`, `qwen3.7-max` (`kimi-k2.6` stays on Cline Pass). Defaults unchanged — Flash 4.1 worker, `qwen3.7-plus` escalate, V4 Pro judge, minmax stays Hy3.
- **DSH / Codex / OpenRouter list prices re-synced** — DSH `deepseek-flash` 0.15/0.6 and `deepseek-v4-pro` 0.66/1.98 (were 0.14/0.28 and 0.435/0.87); Codex Luna 0.2/1.2, Terra 2/12, Sol 4/20; OpenRouter `deepseek/deepseek-chat` 0.32/0.89 (was 0.14/0.28 — estimates ran ~2x low, so caps bit late).
- **Pi escalate is `openrouter/qwen/qwen3-coder-next`** — OpenRouter delisted `qwen/qwen3-coder-plus`; coder-next is its successor tier. Cline-credits escalate keeps `qwen/qwen3-coder-plus`.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.1)

## 0.7.0 — 2026-09-25

Cursor judge is Grok 4.7, DeepSeek Flash defaults are 4.1, and the Go / Cline Pass catalogs pick up the new models.dev rows.

### Headline

- **Cursor judge is Grok 4.7** — `reviewModel` defaults to `grok-4.7` when the worker is Cursor. `grok-4.6` and `grok-4.5` stay allowed. Composer 2.5 is still the only Cursor worker.
- **DeepSeek Flash defaults are 4.1** — DSH worker `deepseek-official/deepseek-flash`, OpenCode Go `opencode-go/deepseek-v4.1-flash`, Cline Pass `cline-pass/deepseek-v4.1-flash`. Previous `deepseek-v4-flash` stays allowed. Go minmax stays Hy3.
- **Claude aliases track the CLI** — `opus` / `sonnet` / `fable` follow Claude Code latest-per-family (Opus 5, Sonnet 5, Fable 5.1 on 2.1.273). List-price estimates match those ids. Opus 5.5 is on the Cursor SDK catalog; the `claude` runtime does not offer it until the CLI does.
- **Codex lists `gpt-6-astra`** — optional, not the default judge (`gpt-5.6-sol` stays).

### Also

- **OpenCode Go / Cline Pass catalog** — `pnpm sync:models` picks up Grok 4.7, GPT-6 Luna, MiMo V2.6 Flash/Pro, and Space Bunny Free from models.dev.
- **Error discovery between runs** — label a diverse sample of `.cursor/loop-exports/` before adding a `verify.sh` / `REVIEWS.md` check. Procedure in `docs/unknowns-preflight.md`; `design-loop` and meta-review point at it. Freeze during a run is unchanged.
- Supported line: **0.7.x**.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.7.0)

## 0.6.3 — 2026-09-21

DSH wrapped credentials abort before WORKER — quoting `version` is not enough.

### Headline

- **DSH wrapped credentials abort before WORKER** — `~/.dsh/.credentials.yaml` must be a flat `KEY: "string"` map. A wrapped store (`version` / `refs` / `records`) or YAML integer (`version: 1`) now fails `agent-check dsh` and `agent-loop run` before spawning headless. Quoting `version` is not enough. The harness does not rewrite that file.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.6.3)

## 0.6.2 — 2026-09-21

Cursor loops no longer inherit OpenCode escalate from repo defaults; scaffold judges stop when the spec exists; DSH credentials `version` must be a quoted string.

### Headline

- **Cursor loops no longer inherit OpenCode `escalateModel`** — repo `defaults` that pin Go minmax (`opencode-go/qwen3.7-plus`) are dropped when `loop.json` sets `runtime: "cursor"`. Composer worker + another judge still uses `reviewRuntime` / `reviewModel`, not `escalateModel`. Invalid Cursor slugs now say whether the field is the worker, the hung-worker fallback, or the judge.
- **`agent-loop-prompt` scaffold stops when the spec exists** — 10-minute wall (not 45m); abort as soon as `GOAL.md` + `verify.sh` pass freeze; prompt forbids `tsc`/`vitest`/`vite` and copying sibling loops.
- **DSH credentials `version` must be a string** — a YAML integer `version: 1` now fails headless boot (`credentials-local`). The harness prints a one-line fix instead of the Node stack. Quote it as `version: "1"`.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.6.2)

## 0.6.1 — 2026-09-15

Frozen-file creation guard, models.dev catalog + pricing, and soft-gated Go / Cline Pass slugs.

### Headline

- **Frozen files also cover creation** — a worker that *adds* a frozen basename (`setup.sh`, `RESEARCH.md`, …) that did not exist at loop start now has it removed on restore and the visit fails, closing the cross-run persistence path where a planted `setup.sh` would be auto-selected by the next `agent-loop run`.
- **Model catalog from models.dev** — `pnpm sync:models` regenerates `OPENCODE_GO_LOOP_MODELS`, `CLINE_PASS_LOOP_MODELS`, and pricing from https://models.dev/api.json; weekly CI PR via `sync-models.yml`. Go / Cline Pass `costUsd` / `maxCostUsd` follow the new rows (some list prices are higher than the old hand table).
- **Soft-gate unknown Go / Cline Pass slugs** — well-formed `opencode-go/<id>` and `cline-pass/<id>` slugs parse even when absent from the curated catalog; unpriced models warn at loop start and report `$0` cost. `maxCostUsd` rejects worker or `escalateModel` slugs with no pricing row.

### Also

- Per-runtime defaults, model-shape validation, and capability flags live in one `RUNTIME_SPEC` table. Invalid-model errors now read `Invalid <field> "<slug>" for <runtimeField> "<runtime>". <hint>`; the zod issue path comes from the typed `AgentModelError.field`. Public exports from `loopAgentConfig` are unchanged.
- DSH companion bash guard documented as a best-effort tripwire (not a sandbox); README states the shell-trust default is warn-and-run.
- Supported line: **0.6.x**.

[npm](https://www.npmjs.com/package/@dancingteeth/agent-looper) · [tag](https://github.com/dancingteeth/agent-looper/releases/tag/v0.6.1)

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

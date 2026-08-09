---
tags:
  - documentation
  - runtimes
  - cost
  - roadmap
---
# Runtime map — cost-minmax workers and future SDKs

Audience: indie builders and small teams who want **fix-until-green** without frontier-model spend. The harness stays the same: shell verify is law; most tokens go to a **cheap worker**; the **judge** runs selectively after green verify.

Related: [Why open](../README.intro.md#why-open) in `README.intro.md`, shipped runtimes in [Worker vs judge](../README.intro.md#worker-vs-judge-by-runtime). Detail: [`opencode-providers.md`](./opencode-providers.md), [`pi-runtime.md`](./pi-runtime.md).

## Shipped today

| `runtime` | SDK / CLI | Worker default (escalate →) | Judge (typical) | Cost angle |
| --- | --- | --- | --- | --- |
| `cursor` | `@cursor/sdk` | `composer-2.5` | Grok 4.5 when worker is `cursor`, else Composer 2.5 | IDE subscription; dogfood default |
| `cline-pass` | `@cline/sdk` | `cline-pass/deepseek-v4-flash` → `qwen3.7-plus` | Cursor Composer 2.5 (unless `reviewRuntime` set) | Quota / subscription implement loops |
| `cline` | `@cline/sdk` | `deepseek/deepseek-chat` → `qwen/qwen3-coder-plus` | Same | Credits when Pass quota is gone |
| `opencode` | `@opencode-ai/sdk` + `opencode` CLI | Go `opencode-go/deepseek-v4-flash` → `qwen3.7-plus`; **or** BYOK e.g. `openrouter/…`, `ollama/…` | Cursor judge, or `reviewRuntime: opencode` | [OpenCode Go](https://opencode.ai/go) **and** OpenRouter / other providers — [`opencode-providers.md`](./opencode-providers.md) |
| `pi` | `@earendil-works/pi-coding-agent` | `openrouter/deepseek/deepseek-chat` → `openrouter/qwen/qwen3-coder-plus` | Cursor judge, or `reviewRuntime: pi` | BYOK OpenRouter-class — [`pi-runtime.md`](./pi-runtime.md) |

Philosophy: **cheap worker iterations, selective judge, never LLM-as-verify.**

Primary judge is independent: unset `reviewRuntime` → Cursor SDK. Set `reviewRuntime` + `reviewModel` to any worker runtime to keep review off Cursor quota.

## Judge presets (`reviewRuntime` + `reviewModel`)

| Stack | `loop.json` sketch | When |
| --- | --- | --- |
| **Dogfood** | `runtime: cursor`, default judge (Grok) | One Cursor bill, strongest judge |
| **Cheap Pi + Pi** | `runtime: pi`, `reviewRuntime: pi`, same `openrouter/…` model | Minimize judge + worker cost on BYOK |
| **Pi worker + Cursor judge** | `runtime: pi`, omit `reviewRuntime` (defaults to cursor) | Cheap implement; Cursor subscription for review |
| **OpenCode Go + Cursor** | `runtime: opencode` (Go model), default judge | Go worker quota; familiar Cursor judge |
| **OpenCode OpenRouter + OpenCode judge** | `runtime: opencode`, `model: openrouter/…`, `reviewRuntime: opencode` | Full BYOK off Cursor — same OpenRouter key for worker and judge |
| **OpenCode Go + Pi judge** | `runtime: opencode`, `reviewRuntime: pi` | Mix Go implement with Pi BYOK review |

## Default stack (“people like us”)

| Role | Pick | Notes |
| --- | --- | --- |
| **Worker** | OpenCode Go, OpenCode OpenRouter, ClinePass Flash-class, or Pi | Escalate on stagnation only |
| **Verify** | Your `verify.sh` | Hard gate; exit `0` |
| **Judge** | Cursor (default), or same runtime as worker via `reviewRuntime` | `postQualityReview: "auto"` + `reviewGate` so nits don’t thrash |
| **Escalate worker** | `qwen3.7-plus` / `qwen3-coder-plus` / DeepSeek Pro tier | Not frontier Opus/GPT as default worker; skip Gemini |

Use Cursor worker when you want one bill and IDE-native dogfood; use another `runtime` when implement tokens should stay off Cursor quota.

## Already shipped (was roadmap)

| Item | Status |
| --- | --- |
| OpenCode Go worker | Shipped |
| OpenCode BYOK (`openrouter/…`, `ollama/…`, …) | Shipped — [`opencode-providers.md`](./opencode-providers.md) |
| Pi `WorkerRuntime` | Shipped — [`pi-runtime.md`](./pi-runtime.md) |
| Variable primary judge (`reviewRuntime` + `reviewModel`) | Shipped |

## Roadmap — integrate next (ranked)

| Rank | Candidate | API shape | Harness fit | Effort | Verdict |
| --- | --- | --- | --- | --- | --- |
| **1** | **Codex SDK** | `@openai/codex-sdk` | Strong thread API (`run` / `runStreamed`, cwd) | **M** | **Next** — real demand (ChatGPT/Codex users); BYO OpenAI stack — [`codex-runtime-roadmap.md`](./codex-runtime-roadmap.md) |
| **2** | **Aider** | CLI (`aider --message`); no stable Node peer | Spawn adapter; watch auto-commit vs harness git | **M** (CLI) / **L** (first-class) | **Later** — cheap models, awkward fit |
| **3** | **Goose** | `@aaif/goose-sdk` + CLI, ACP | Programmatic agent; more process surface than Pi | **M–L** | **Later / low demand** — fine if someone needs it; not a wedge |

Keep this file and `README.intro.md` / `README.md` worker–judge tables in sync when a runtime ships.

## Explicit skip (wrong shape or wrong spend)

| Skip | Why |
| --- | --- |
| **Continue `@continuedev/sdk`** | Hub chat / OpenAI-compat — not a repo-editing agent runtime |
| **Roo Code / IDE-only agents** | No stable programmatic worker API for the harness |
| **`@openrouter/agent` alone** | Primitives only; you rebuild the coding agent (**L**, overlaps OpenCode/Pi) |
| **Vercel AI SDK alone** | LLM client ≠ agentic edit/bash loop |
| **Claude Code / sealed agents as default worker** | Closed personalization wall; hook-only extension |
| **Frontier Opus / GPT-class as default worker** | Wrong economics for grind loops; judge-only if ever |
| **Gemini (Flash / Pro) as worker or judge** | Weak relative to DeepSeek / Qwen / Composer / Grok on fix-until-green; keep out of defaults — opt in only if you insist |

## Open-source positioning (share / fork)

When you publish or fork Agent Looper, the sell is not “another coding agent.” It is an **MIT spine** you (or your agent) can rewrite: `GOAL.md`, `verify.sh`, `REVIEWS.md`, and orchestration. Models stay BYO; [devtools must be open source](https://blog.exe.dev/devtools-must-be-open-source) because **source is the extension system** — closed agents cap you at vendor hooks.

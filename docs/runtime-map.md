---
tags:
  - documentation
  - runtimes
  - cost
  - roadmap
---
# Runtime map — cost-minmax workers and future SDKs

Audience: indie builders and small teams who want **fix-until-green** without frontier-model spend. The harness stays the same: shell verify is law; most tokens go to a **cheap worker**; the **judge** runs selectively after green verify.

Related: [Why open](../README.intro.md#why-open) in `README.intro.md`, shipped runtimes in [Worker vs judge](../README.intro.md#worker-vs-judge-by-runtime).

## Shipped today

| `runtime` | SDK / CLI | Worker default | Judge (typical) | Cost angle |
| --- | --- | --- | --- | --- |
| `cursor` | `@cursor/sdk` | Composer 2.5 | Grok 4.5 (`reviewModel`) | IDE subscription; dogfood default |
| `cline-pass` | `@cline/sdk` | `cline-pass/deepseek-v4-flash` → escalate `qwen3.7-plus` | Cursor Composer 2.5 | Quota / subscription implement loops |
| `cline` | `@cline/sdk` | `deepseek/deepseek-chat` → escalate `gemini-2.5-pro` | Cursor Composer 2.5 | Credits when Pass quota is gone |
| `opencode` | `@opencode-ai/sdk` + `opencode` CLI | `opencode-go/deepseek-v4-flash` → escalate `qwen3.7-plus` | Cursor judge | [OpenCode Go](https://opencode.ai/go) gateway |

Philosophy: **cheap worker iterations, selective judge, never LLM-as-verify.**

## Default stack (“people like us”)

| Role | Pick | Notes |
| --- | --- | --- |
| **Worker** | OpenCode Go or ClinePass Flash-class | Escalate on stagnation only |
| **Verify** | Your `verify.sh` | Hard gate; exit `0` |
| **Judge** | Cursor Grok 4.5 or Composer 2.5 | `postQualityReview: "auto"` + `reviewGate` so nits don’t thrash |
| **Escalate worker** | `qwen3.7-plus` / DeepSeek Pro tier | Not frontier Opus/GPT as default worker |

Use Cursor worker when you want one bill and IDE-native dogfood; use Cline/OpenCode when implement tokens should stay off Cursor quota.

## Roadmap — integrate next (ranked)

| Rank | Candidate | API shape | Harness fit | Effort | Verdict |
| --- | --- | --- | --- | --- | --- |
| **1** | **OpenCode deepen** | Already `@opencode-ai/sdk` | Same `WorkerRuntime`; broaden model IDs (OpenRouter / Ollama BYOK where CLI supports) | **S–M** | **Now** — cheapest juice per line of harness code |
| **2** | **Pi** | `@earendil-works/pi-coding-agent` (TS), providers via `pi-ai` | Session + tools + cwd → mirror `opencode` / Cursor runners | **M** | **Next** — open agent you can fork; multi-provider BYOK |
| **3** | **Goose** | `@aaif/goose-sdk` + CLI, ACP | Programmatic agent; more process surface than Pi | **M–L** | **Later** — local / OpenRouter paths |
| **4** | **Codex SDK** | `@openai/codex-sdk` | Strong thread API (`run` / `runStreamed`, cwd) | **M** | **Later, narrow** — only if you already pay OpenAI/ChatGPT |
| **5** | **Aider** | CLI (`aider --message`); no stable Node peer | Spawn adapter; watch auto-commit vs harness git | **M** (CLI) / **L** (first-class) | **Later** — cheap models, awkward fit |

## Explicit skip (wrong shape or wrong spend)

| Skip | Why |
| --- | --- |
| **Continue `@continuedev/sdk`** | Hub chat / OpenAI-compat — not a repo-editing agent runtime |
| **Roo Code / IDE-only agents** | No stable programmatic worker API for the harness |
| **`@openrouter/agent` alone** | Primitives only; you rebuild the coding agent (**L**, overlaps OpenCode/Pi) |
| **Vercel AI SDK alone** | LLM client ≠ agentic edit/bash loop |
| **Claude Code / sealed agents as default worker** | Closed personalization wall; hook-only extension |
| **Frontier Opus / GPT-class as default worker** | Wrong economics for grind loops; judge-only if ever |

## Implementation order (harness)

1. **OpenCode model allowlist** — accept non–`opencode-go/*` providers already supported by the CLI; keep Go defaults.
2. **Pi `WorkerRuntime` spike** — optional peer dependency; same fresh-session contract as other runtimes.
3. **Docs** — keep this file and `README.intro.md` worker table in sync when a runtime ships.

## Open-source positioning (share / fork)

When you publish or fork agent-loop, the sell is not “another coding agent.” It is an **MIT spine** you (or your agent) can rewrite: `GOAL.md`, `verify.sh`, `REVIEWS.md`, and orchestration. Models stay BYO; [devtools must be open source](https://blog.exe.dev/devtools-must-be-open-source) because **source is the extension system** — closed agents cap you at vendor hooks.

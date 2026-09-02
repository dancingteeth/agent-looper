---
tags:
  - documentation
  - runtimes
  - pi
  - cost
  - agentic_ai
  - agents
  - loops
---
# Pi worker runtime

`runtime: pi` embeds [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent): read/bash/edit/write tools, fresh in-memory session per worker iteration. Harness instructions are appended via Pi’s `DefaultResourceLoader.appendSystemPrompt` (not stuffed into the user message).

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "pi"` to use Pi for review too.

## Install

```bash
pnpm add -D @earendil-works/pi-coding-agent
export OPENROUTER_API_KEY=…   # or ANTHROPIC_API_KEY, OPENAI_API_KEY, …
agent-check pi
```

Auth also lives in `~/.pi/agent/auth.json` after `pi` /connect.

## Defaults

| Field | Default |
| --- | --- |
| `model` | `openrouter/deepseek/deepseek-chat` |
| `escalateModel` | `openrouter/qwen/qwen3-coder-plus` |

Use `provider/model` ids from Pi’s catalog (`getModel` / pi TUI). **Do not** use `opencode-go/*` on this runtime — use `runtime: opencode` for OpenCode Go. OpenRouter `:free` suffixes (`openrouter/minimax/minimax-m3:free`) are valid here too — pin worker and judge; unset `reviewRuntime` still means Cursor. See [`opencode-providers.md`](./opencode-providers.md).

## Custom OpenAI-compatible gateways

Pi has **no** native Vercel / OrcaRouter catalog. Defaults stay OpenRouter. To use another OpenAI-compatible endpoint, register it in `~/.pi/agent/models.json` (`api: "openai-completions"`, your `baseUrl` + env key name), then set `model` to `provider/model` in `loop.json`.

| Gateway | Typical use |
| --- | --- |
| **OrcaRouter** | Custom provider `baseUrl` `https://api.orcarouter.ai/v1` |
| **LiteLLM** | Point `baseUrl` at your proxy if you already run one |
| **Portkey** | Custom OpenAI-compatible `baseUrl` |
| **Vercel AI Gateway** | Prefer `runtime: opencode` + `vercel/…` (native). On Pi, same custom-provider recipe. |

See [Pi custom providers](https://pi.dev/docs).

## Example

```json
{
  "runtime": "pi",
  "model": "openrouter/deepseek/deepseek-chat",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

Cheap Pi worker + Pi judge:

```json
{
  "runtime": "pi",
  "reviewRuntime": "pi",
  "reviewModel": "openrouter/deepseek/deepseek-chat",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

## vs OpenCode

| | **Pi** | **OpenCode** |
| --- | --- | --- |
| Gateway | Your provider keys / Pi auth | OpenCode Go and/or OpenCode-supported BYOK |
| Go subscription slugs | No (`opencode-go/…` rejected) | Yes (curated list) |
| Dependency | `@earendil-works/pi-coding-agent` | `@opencode-ai/sdk` + `opencode` CLI |

See [`docs/runtime-map.md`](./runtime-map.md).

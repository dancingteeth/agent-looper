---
tags:
  - documentation
  - runtimes
  - pi
  - cost
---
# Pi worker runtime

`runtime: pi` embeds [@earendil-works/pi-coding-agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent): read/bash/edit/write tools, fresh in-memory session per worker iteration. Harness instructions are appended via Pi’s `DefaultResourceLoader.appendSystemPrompt` (not stuffed into the user message).

Judge path is unchanged (Cursor SDK).

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
| `escalateModel` | `openrouter/google/gemini-2.5-flash` |

Use `provider/model` ids from Pi’s catalog (`getModel` / pi TUI). **Do not** use `opencode-go/*` on this runtime — use `runtime: opencode` for OpenCode Go.

## Example

```json
{
  "runtime": "pi",
  "model": "openrouter/deepseek/deepseek-chat",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

## vs OpenCode

| | **Pi** | **OpenCode** |
| --- | --- | --- |
| Gateway | Your provider keys / Pi auth | OpenCode Go and/or OpenCode-supported BYOK |
| Go subscription slugs | No (`opencode-go/…` rejected) | Yes (curated list) |
| Dependency | `@earendil-works/pi-coding-agent` | `@opencode-ai/sdk` + `opencode` CLI |

See [`docs/runtime-map.md`](./runtime-map.md).

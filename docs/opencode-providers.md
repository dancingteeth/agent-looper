---
tags:
  - documentation
  - runtimes
  - opencode
  - cost
---
# OpenCode worker — Go, OpenRouter, Ollama

`runtime: opencode` uses `@opencode-ai/sdk` + the `opencode` CLI. The harness starts a local OpenCode server per loop session, wires API keys from env when present, and passes `provider/model` from `loop.json` to each worker iteration.

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime` to `opencode` or `pi` to match a BYOK judge.

## Defaults (cost-minmax)

| Field | Default |
| --- | --- |
| `model` | `opencode-go/deepseek-v4-flash` |
| `escalateModel` | `opencode-go/qwen3.7-plus` (after stagnation) |

Go slugs must appear in `OPENCODE_GO_LOOP_MODELS` (see [OpenCode Go docs](https://opencode.ai/docs/go/)).

## BYOK and local models

Any other OpenCode provider id is allowed in `provider/model` form, for example:

| Example `model` | Auth |
| --- | --- |
| `openrouter/deepseek/deepseek-chat` | `OPENROUTER_API_KEY` (harness calls `auth.set`; CLI also reads env) |
| `ollama/llama3.2` | Local Ollama — no key; use `opencode /connect` or host config |
| `anthropic/claude-sonnet-4-20250514` | Provider env or `~/.local/share/opencode/auth.json` from `/connect` |

The harness wires `OPENCODE_API_KEY` / `OPENROUTER_API_KEY` into the ephemeral server when present. For those providers, each iteration **fails fast** if the key is missing and `~/.local/share/opencode/auth.json` has no entry (override path via `OPENCODE_AUTH_JSON`). Other providers (e.g. Ollama) are left to OpenCode’s own config.

Curated Go list + pricing estimates: `OPENCODE_GO_LOOP_MODELS` in code. BYOK models use provider-reported cost when available; otherwise `costUsd` may be `0` in logs.

## Example `loop.json`

```json
{
  "runtime": "opencode",
  "model": "openrouter/deepseek/deepseek-chat",
  "escalateModel": "openrouter/qwen/qwen-2.5-coder-32b-instruct",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

OpenCode Go worker + Cursor Grok judge (default `reviewRuntime`):

```json
{
  "runtime": "opencode",
  "model": "opencode-go/deepseek-v4-flash",
  "reviewModel": "grok-4.5",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

## Check

```bash
export OPENROUTER_API_KEY=…   # and/or OPENCODE_API_KEY for Go
agent-check opencode
```

## Transport failures (`fetch failed`)

If iteration 1 dies with `OpenCode session.prompt failed …: fetch failed` **before** verify runs:

| Symptom | Meaning |
| --- | --- |
| Local server started, `session.create` OK, `session.prompt` fails | Provider/TLS/reset or wedged OpenCode process — **not** a bad GOAL/verify |
| Empty `log.ndjson`, no token usage | No successful model round-trip |
| Short OpenCode prompts (meta-review) still work | Long implement prompts to Go can flake independently |

Harness behavior (0.1.9+):

1. Error messages include the `Error.cause` chain (`code` / `errno` / `syscall` when present) plus `[layer=transport]`
2. Transient retries **recycle the local OpenCode server** (not only `session.create`) before the next attempt
3. `failure-domains.ndjson` fingerprints `agent_error|transport|…` with a suggestion that this is pre-verify transport

If all retries still fail: check Go gateway / network, try `escalateModel` or a BYOK slug, re-run later. Product salvage outside the harness is expected when the worker never starts.

## See also

- [`docs/runtime-map.md`](./runtime-map.md) — cost-minmax presets (incl. `reviewRuntime`)
- [`docs/pi-runtime.md`](./pi-runtime.md) — Pi BYOK worker / judge
- [OpenCode providers](https://opencode.ai/docs/providers/)

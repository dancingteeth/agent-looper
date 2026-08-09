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

## Transport failures (`fetch failed` / hang)

If iteration 1 dies with `OpenCode session.prompt failed …: fetch failed` **or** appears to hang after `session_id=…`:

| Symptom | Meaning |
| --- | --- |
| Local server started, `session.create` OK, then silence | Worker is waiting on the Go provider (normal until heartbeat/stall) |
| `UND_ERR_HEADERS_TIMEOUT` on old releases | Blocking `session.prompt` held one HTTP call for the whole turn |
| Empty `log.ndjson`, no token usage | No successful model round-trip |

Harness behavior (0.1.11+):

1. Uses **`session.promptAsync`** + waits for **`session.idle`** (HTTP returns immediately; no undici headers timeout on a 45‑minute turn)
2. **Heartbeat** every ~30s: `still working session=… elapsed=…s phase=awaiting_first_byte|in_turn …`
3. **TTFB stall** (~3 min with **no session-scoped events yet**) → transport error + local server recycle. After the turn is alive (`session.status` / messages), long quiet tools are allowed until the **45m** overall timeout — stall does **not** re-arm mid-turn
4. Sid-less SSE noise is ignored for activity; sid-less `session.idle` is accepted for the single waiter
5. Error messages include the `Error.cause` chain plus `[layer=transport]`
6. `failure-domains.ndjson` fingerprints `agent_error|transport|…`

Cloud poll tip: match `EXIT:` / `finished complete=` / `Verifier passed` — **not** `layer=transport` (that’s a retry, not done).

If all retries still stall at TTFB: check Go gateway / network, try `escalateModel` or a BYOK slug, re-run later.

## See also

- [`docs/runtime-map.md`](./runtime-map.md) — cost-minmax presets (incl. `reviewRuntime`)
- [`docs/pi-runtime.md`](./pi-runtime.md) — Pi BYOK worker / judge
- [OpenCode providers](https://opencode.ai/docs/providers/)

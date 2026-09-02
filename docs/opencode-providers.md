---
tags:
  - documentation
  - runtimes
  - opencode
  - cost
  - agentic_ai
  - agents
  - loops
---
# OpenCode worker — Go, BYOK gateways, Ollama

`runtime: opencode` uses `@opencode-ai/sdk` + the `opencode` CLI. The harness starts a **local OpenCode server per loop session** by spawning `opencode.exe` (not the pnpm shell shim). Dispose SIGTERMs the serve **process tree** (MCP children included), SIGKILLs leftovers, and a parent-death reaper cleans up if the harness Node process is SIGKILL’d. SDK `server.close()` alone is not enough: it only kills the shim, which orphaned `opencode.exe` + Toolport/githits MCP processes under PID 1.

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "opencode"` to judge on Go (defaults to **`opencode-go/deepseek-v4-pro`**, not Flash). BYOK OpenCode judges still need an explicit `reviewModel`.

## Defaults (cost-minmax)

| Field | Default |
| --- | --- |
| `model` | `opencode-go/deepseek-v4-flash` |
| `escalateModel` | `opencode-go/qwen3.7-plus` (after stagnation **or** a hung/timed-out worker) |
| `reviewModel` (when `reviewRuntime: "opencode"`) | `opencode-go/deepseek-v4-pro` (not Flash) |

Go slugs must appear in `OPENCODE_GO_LOOP_MODELS` (see [OpenCode Go docs](https://opencode.ai/docs/go/)). **Hy3** (`opencode-go/hy3`) is on that list — slower than Flash, large monthly quota. `costPreset: "minmax"` binds Hy3 as the Go worker (not Flash) plus a Grok judge when Cursor is installed.

## BYOK and local models

Any other OpenCode provider id is allowed in `provider/model` form, for example:

| Example `model` | Auth |
| --- | --- |
| `openrouter/deepseek/deepseek-chat` | `OPENROUTER_API_KEY` (harness calls `auth.set`; CLI also reads env) |
| `vercel/anthropic/claude-sonnet-4` | `AI_GATEWAY_API_KEY` (Vercel AI Gateway — same `auth.set` path) |
| `cloudflare-workers-ai/…` | OpenCode `/connect` (account id + API token) or `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_KEY`. Cloudflare GPU inference — not AI Gateway. Not a harness env alias. |
| `ollama/llama3.2` | Local Ollama — no key; use `opencode /connect` or host config |
| `anthropic/claude-sonnet-4-20250514` | Provider env or `~/.local/share/opencode/auth.json` from `/connect` |

The harness wires `OPENCODE_API_KEY` / `OPENROUTER_API_KEY` / `AI_GATEWAY_API_KEY` into the ephemeral server when present. For those providers, each iteration **fails fast** if the key is missing and `~/.local/share/opencode/auth.json` has no entry (override path via `OPENCODE_AUTH_JSON`). Other providers (Ollama, Cloudflare Workers AI, …) are left to OpenCode’s own config.

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
  "reviewModel": "grok-4.6",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

OpenCode Go worker + OpenCode V4 Pro judge (omit `reviewModel`):

```json
{
  "runtime": "opencode",
  "model": "opencode-go/deepseek-v4-flash",
  "reviewRuntime": "opencode",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

Vercel AI Gateway (list price, no markup) — OpenCode’s native `vercel` provider:

```json
{
  "runtime": "opencode",
  "model": "vercel/anthropic/claude-sonnet-4",
  "reviewRuntime": "opencode",
  "reviewModel": "vercel/anthropic/claude-sonnet-4",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

## Check

```bash
export OPENROUTER_API_KEY=…   # and/or OPENCODE_API_KEY (Go) and/or AI_GATEWAY_API_KEY (Vercel)
agent-check opencode
```

## Other OpenAI-compatible gateways

The harness does **not** add a new runtime for LLM proxies. Point OpenCode at any OpenAI-compatible endpoint yourself, then pass `provider/model` in `loop.json`. Fail-fast env wiring stays limited to Go / OpenRouter / Vercel.

| Gateway | How |
| --- | --- |
| **OrcaRouter** | Custom provider in `opencode.json` (`npm`: `@ai-sdk/openai-compatible`, `baseURL` `https://api.orcarouter.ai/v1`). Then `orcarouter/…` in `loop.json`. |
| **LiteLLM** (self-hosted) | Same custom-provider shape, or OpenCode’s community LiteLLM plugin if you already run a proxy. |
| **Portkey** (Prisma AIRS) | Custom OpenAI-compatible `baseURL`. Enterprise governance — not a harness default. |
| **Cloudflare AI Gateway** | Native OpenCode `/connect` (account id + gateway id + token). Proxy in front of providers — distinct from **Workers AI** inference in the table above. |

See [OpenCode custom providers](https://opencode.ai/docs/providers/#custom-provider).

## Transport failures (`fetch failed` / hang)

If iteration 1 dies with `OpenCode session.prompt failed …: fetch failed` **or** appears to hang after `session_id=…`:

| Symptom | Meaning |
| --- | --- |
| Local server started, `session.create` OK, then silence | Worker is waiting on the Go provider (normal until heartbeat/stall) |
| `UND_ERR_HEADERS_TIMEOUT` on old releases | Blocking `session.prompt` held one HTTP call for the whole turn |
| Empty `log.ndjson`, no token usage | No successful model round-trip |

Harness behavior (0.1.11+):

1. Uses **`session.promptAsync`** + waits for **`session.idle`** (HTTP returns immediately; no undici headers timeout on a 45‑minute turn)
2. **Heartbeat** every ~30s: `still working session=… elapsed=…s phase=awaiting_first_byte|awaiting_first_tool|in_turn …`
3. **TTFB stall** (~3 min with **no session-scoped events yet**) → transport error + local server recycle. After the turn is alive (`session.status` / messages), **no-tool stall** (~8 min of text streaming without a tool part) kills a rambling model so the loop can switch to `escalateModel`. Quiet tool runs after the first tool are allowed until the **45m** overall timeout.
4. Sid-less SSE noise is ignored for activity; sid-less `session.idle` is accepted for the single waiter
5. Error messages include the `Error.cause` chain plus `[layer=transport]`
6. `failure-domains.ndjson` fingerprints `agent_error|transport|…`

A 45-minute `timed out after` or an 8-minute no-tool stall is **not** retried on the same model. The iteration is recorded as a worker fault and the next iteration uses `escalateModel` when set. Heartbeats can look alive the whole time (`phase=awaiting_first_tool`).

Cloud poll tip: match `EXIT:` / `finished complete=` / `Verifier passed` — **not** `layer=transport` (that’s a retry, not done).

If all retries still stall at TTFB: check Go gateway / network, try `escalateModel` or a BYOK slug, re-run later.

## Dangling `~/.agents/skills`

OpenCode loads global skills at session create. A `SKILL.md` symlink whose Cursor plugin-cache target was purged used to fail with `ENOENT` (`UnknownError`). `runtime: opencode` and `agent-check opencode` now **relink** that path to the current cache hash when a sibling folder still has the skill, or **drop** the dangling link so the session can boot. Leftovers that cannot be unlinked still fail fast.

## See also

- [`docs/runtime-map.md`](./runtime-map.md) — cost-minmax presets (incl. `reviewRuntime`)
- [`docs/pi-runtime.md`](./pi-runtime.md) — Pi BYOK worker / judge
- [OpenCode providers](https://opencode.ai/docs/providers/)

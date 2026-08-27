---
tags:
  - documentation
  - loops
  - dogfood
  - agentic_ai
  - agents
---
# Dogfooding Agent Looper on itself

This checkout is both the **harness package** and a **consumer**. Loops live under
`.cursor/loops/`; repo profile is `.cursor/agent-loop.repo.json`.

**Package consumers** should install from npm — see [`CONSUMERS.md`](../CONSUMERS.md)
and [`docs/releasing.md`](./releasing.md). This page is for **harness maintainers**
developing against local `dist/`.

## Run locally

```bash
pnpm build
pnpm agent:loop run .cursor/loops/<name>
```

Repo default is `costPreset: "minmax"` in `.cursor/agent-loop.repo.json`. Sparse loops bind Hy3 + Grok when OpenCode Go and Cursor are both installed (Composer + Grok on Cursor-only). Loops that pin `"runtime": "cursor"` stay on Composer. This is not Cursor Auto / build.

Secrets via Doppler (`doppler.yaml` in the repo root); scripts wrap `doppler run`.

From **Cursor chat**, the agent starts the loop: attach Shell (`block_until_ms` ≥ 45m, `notify_on_output` on `^AGENT_LOOP_DONE `). Do not `block_until_ms: 0` — the IDE reaps those jobs at ~5 min. Do not tell the human to run it in a terminal unless they asked to walk away (Telegram / HITL wake them).

Smoke peers (after `pnpm build`):

```bash
pnpm agent:check:opencode
pnpm agent:check:pi
pnpm agent:check:dsh
pnpm agent:loop run .cursor/loops/opencode-smoke --runtime opencode
pnpm agent:loop run .cursor/loops/pi-smoke --runtime pi
```

OpenCode OpenRouter / Vercel AI Gateway BYOK / Pi+Pi judge examples: [`opencode-providers.md`](./opencode-providers.md),
[`pi-runtime.md`](./pi-runtime.md), [`runtime-map.md`](./runtime-map.md).

## Workflow

1. Edit or add a loop under `.cursor/loops/<name>/` (`GOAL.md`, `loop.json`, `verify.sh`).
2. Implement (human or `pnpm agent:loop …`).
3. Pass: `bash .cursor/loops/<name>/verify.sh`.
4. Inspect `run-report.md` / `log.ndjson` (or `agent-loop-export-run`).

## Caveat

The CLI runs from **`dist/`** while the agent edits **`src/`**. Always rebuild, or let
`verify` typecheck/test from source, so the judge stays honest.

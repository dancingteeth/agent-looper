---
tags:
  - documentation
  - loops
  - dogfood
---
# Dogfooding agent-loop on itself

This repo is both the **harness package** and a **consumer**. Loops live under
`.cursor/loops/`; profile is `.cursor/agent-loop.repo.json`
(`taskwarriorProject: agent-loop`).

## Why not publish to npm first?

Consumers already use `file:../agent-loop`. Dogfood runs against local `dist/`:

```bash
pnpm build
pnpm agent:loop run .cursor/loops/<name> --runtime cursor --review-gate
```

Secrets come from Doppler project **`agent-looper`** / config **`dev`**
(`doppler.yaml` in the repo root). Scripts wrap `doppler run` so
`CURSOR_API_KEY`, `CLINE_API_KEY`, `OPENCODE_API_KEY`, and `AGENT_LOOP_TELEGRAM_*` inject automatically.

Quick OpenCode / OpenRouter / Pi smoke:

```bash
pnpm build
pnpm agent:check:opencode
pnpm agent:check:pi

# OpenCode Go (default model in loop.json)
pnpm agent:loop run .cursor/loops/opencode-smoke --runtime opencode

# OpenCode + OpenRouter BYOK
pnpm agent:loop run .cursor/loops/opencode-smoke --runtime opencode \
  --model openrouter/deepseek/deepseek-chat

# Pi + OpenRouter BYOK
pnpm agent:loop run .cursor/loops/pi-smoke --runtime pi
```

Publish to npm only when you want install without a sibling checkout.

## Active loops

| Loop | TW UUID | Feature |
| --- | --- | --- |
| `reproduce-before-report` | `b2185d70-…` (2a done; UUID now 2b) | M2a path filter |
| `reproduce-agent` | `b2185d70-2889-4eed-94c2-d99949954211` | M2b fresh-context reproduce agent (done) |
| `secondary-judge` | `adf66bf8-d52a-43e2-8009-756649cc32b2` | M3 multi-family secondary judge (done) |
| `meta-review` | `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00` | M5 cross-loop meta-review CLI (done) |
| `verify-mode` | `fe3f4076-b997-4d28-a59a-baf720c28e5d` | M4 Track B `verifyMode` (done) |
| `post-success-review` | `17bfc1cd-bf5d-43a7-9b8b-9bf7658aaa07` | Extract review-gate state machine (done) |
| `loop-risk-profiles` | `de4144f2-9e6a-4cf6-8943-81efc49d4c5c` | Configurable loopRisk profiles (done) |
| `pricing-trust-hygiene` | `f3280589-…` / `a774c5d7-…` | Model pricing drift + `--trust-config` gate (done) |
| `example-fix` | — | Scaffold template only |
| `opencode-smoke` | — | OpenCode Go / OpenRouter BYOK smoke (writes `probe.txt`) |
| `pi-smoke` | — | Pi + OpenRouter BYOK smoke (writes `probe.txt`) |

## Review overlays

- Per-loop gate: slim harness prompt + root `REVIEWS.md` (from `templates/REVIEWS.md`)
- Full chat review: unified-code-review skill (not inlined into gates)
- Meta-review (M5): [`meta-review-prompt.md`](./meta-review-prompt.md)

## Workflow

1. Create / edit loop: `GOAL.md`, `loop.json`, `verify.sh`, `VERIFY.skill.md`.
2. Put Taskwarrior **UUID** in GOAL + `taskwarriorUuid`.
3. Implement (human or `pnpm agent:loop …`).
4. Pass: `bash .cursor/loops/<name>/verify.sh`.
5. Inspect `run-report.md` / `log.ndjson` for transparency (or `agent-loop-export-run` to regenerate).
6. Commit; `task <uuid> done` if not auto-completed.

## Caveat

The CLI runs from **`dist/`** while the agent edits **`src/`**. Always rebuild
or let `verify` typecheck/test from source so the judge stays honest.

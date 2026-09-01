---
tags:
  - documentation
  - runtimes
  - codex
  - cost
  - agents
---
# Codex worker runtime

`runtime: codex` embeds [`@openai/codex-sdk`](https://www.npmjs.com/package/@openai/codex-sdk)
(wraps the `@openai/codex` CLI over JSONL). Fresh **thread per outer-loop iteration** — no chat
memory across implement turns. Harness system instructions are **prepended** to the user prompt
(Codex has no first-class system channel in the SDK).

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "codex"` to judge with Codex too.

Frozen against SDK **0.147.x** (see [`codex-runtime-roadmap.md`](./codex-runtime-roadmap.md)).

## Call shape

```ts
import { Codex } from '@openai/codex-sdk'

const codex = new Codex({ apiKey }) // optional; else CODEX_API_KEY / ChatGPT CLI login
const thread = codex.startThread({
  model: 'gpt-5.6-luna',
  workingDirectory: repoRoot,
  skipGitRepoCheck: true,
  approvalPolicy: 'never',
  sandboxMode: 'workspace-write',
})
const turn = await thread.run(`${systemPrompt}\n\n---\n\n${userPrompt}`)
// turn.finalResponse, turn.items, turn.usage
```

Each turn spawns `codex exec` (not a loop-lived server). Abort/timeout SIGTERMs that child;
the harness also watches new children of the Node process and kills the tree (MCP grandchildren
included), plus a parent-death reaper if the harness itself is SIGKILL’d mid-turn.

Unattended loops use `approvalPolicy: "never"` and `sandboxMode: "workspace-write"` so Codex can
edit the repo without interactive approval. The harness passes `skipGitRepoCheck: true` so Codex
works on any `repoRoot` the harness already resolved (not only Git trees). The harness still owns
git / verify.

## Install

```bash
pnpm add -D @openai/codex-sdk
export CODEX_API_KEY=…   # or OPENAI_API_KEY; or `codex` ChatGPT login
agent-check codex
```

## Defaults

| Field | Default |
| --- | --- |
| `model` | `gpt-5.6-luna` |
| `escalateModel` | `gpt-5.6-terra` |
| `reviewModel` (when `reviewRuntime: "codex"`) | `gpt-5.6-sol` |

Model ids are Codex CLI slugs (not `provider/model`). Override with any slug your Codex account accepts
(see Codex `models.json` / `model/list`).

## Auth

1. `CODEX_API_KEY` or `OPENAI_API_KEY` (SDK injects `CODEX_API_KEY` for the CLI), or
2. ChatGPT login via the Codex CLI (`~/.codex`)

## Example

```json
{
  "runtime": "codex",
  "model": "gpt-5.6-luna",
  "escalateModel": "gpt-5.6-terra",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

Codex worker + Codex judge (Sol):

```json
{
  "runtime": "codex",
  "reviewRuntime": "codex",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

(`reviewModel` defaults to `gpt-5.6-sol`; set it explicitly to override.)

## Constraints

- Shell verify remains the hard gate — Codex cannot mark the loop complete.
- Do not rely on Codex auto-commit; harness owns git.
- `skipGitRepoCheck: true` — Codex CLI would otherwise refuse non-Git cwd; Agent Looper is
  repo-root–driven, not Git-check–driven.
- When `reviewRuntime: "codex"`, judge defaults to **`gpt-5.6-sol`** (frontier) — not Luna.
  Worker defaults stay Luna → Terra escalate. Override with `reviewModel` if you want a cheaper judge.
- Streaming (`runStreamed`) is optional; v1 uses buffered `run()`.
- Manual smoke: `pnpm agent:check:codex` then
  `pnpm agent:loop run .cursor/loops/codex-smoke --runtime codex`.

See [`docs/runtime-map.md`](./runtime-map.md).

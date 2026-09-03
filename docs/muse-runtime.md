---
tags:
  - documentation
  - runtimes
  - muse
  - cost
  - agents
---
# Muse Code worker runtime

`runtime: muse` embeds [`@muse-code/sdk`](https://www.npmjs.com/package/@muse-code/sdk)
(MSP client over `muse serve`). Fresh **session per outer-loop iteration** — no chat
memory across implement turns. Harness system instructions are **prepended** to the user prompt.
`MuseClient.spawn` starts a **loop-lived** `muse serve` (detached process group). SDK `close()`
already SIGTERMs that group; the harness also tracks the serve pid, SIGKILLs leftovers, and
starts a parent-death reaper so Cursor Agent Shell SIGKILL of Node cannot leave `muse` + MCP
under PID 1.

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "muse"` to judge with Muse too.

Not on `costPreset` minmax — Spark is not Flash-class cheap. Use an explicit `runtime: muse`.

Developer Preview SDK **0.1.1**. Do not vendor the SDK; install the optional peer.

## Call shape

```ts
import { MuseClient } from '@muse-code/sdk'

const client = await MuseClient.spawn({
  museBin: 'muse',
  args: ['serve'],
  env: { ...process.env },
  clientInfo: { name: 'agent_looper', version },
})
const session = await client.startSession({
  workspaceRoot: repoRoot,
  modelId: 'muse-spark-1.3-contributor',
  approvalMode: 'allowAll',
})
session.onApproval((request) => ({ choiceId: /* approved* decision */ }))
const turn = await session.sendUserTurn({
  input: [{ type: 'text', text: `${systemPrompt}\n\n---\n\n${userPrompt}` }],
})
await turn.completed
```

`clientInfo.name` must match `^[a-z0-9_]+$` (MSP SS1.4.1) — hyphenated npm names are rejected.

Unattended loops use `approvalMode: "allowAll"` **and** an `onApproval` handler (no handler
defaults to deny and hangs). The harness still owns git / verify. Do not nest Muse
goal/observers/workflows — `GOAL.md` + `verify.sh` stay on this side.

`muse serve` exit **5** means the experimental SDK host is off on that binary — fail closed.

Schema fingerprint mismatches are logged; we do not pin Meta’s fingerprint in CI.

## Install

```bash
pnpm add -D @muse-code/sdk
# PATH `muse` from Muse Code: https://dev.meta.ai/docs/muse-code
export META_API_KEY=…   # optional; CLI login is enough
agent-check muse
```

## Defaults

| Field | Default |
| --- | --- |
| `model` | `muse-spark-1.3-contributor` |
| `escalateModel` | unset — PAYG `muse-spark-1.3` is the same weights (billing / whether Meta trains), not a stronger model |
| `reviewModel` (when `reviewRuntime: "muse"`) | `muse-spark-1.3` (PAYG slug; not a stronger judge) |
| `reasoningEffort` / `escalateReasoningEffort` | the only escalate lever |

Model ids are Muse Spark slugs (`muse-spark-1.3`, `muse-spark-1.3-contributor`, …), not `provider/model`.
`reasoningEffort` (`low`…`xhigh` \| `none`) is sent on the MSP turn when set. Climb `escalateReasoningEffort` across iterations. There is no stronger Spark model to swap in.

## Auth

1. Muse Code CLI login, or
2. `META_API_KEY` for the Model API

Subscriptions apply to Muse Code CLI login keys. Extra Model API keys are PAYG.

## Example

```json
{
  "runtime": "muse",
  "model": "muse-spark-1.3-contributor",
  "reasoningEffort": "low",
  "escalateReasoningEffort": "high",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

Muse worker + Muse judge (PAYG Spark):

```json
{
  "runtime": "muse",
  "reviewRuntime": "muse",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

(`reviewModel` defaults to `muse-spark-1.3`; set it explicitly to override.)

## Constraints

- Shell verify remains the hard gate — Muse cannot mark the loop complete.
- Do not rely on Muse auto-commit; harness owns git.
- `onApproval` must pick a server-minted `choiceId` whose `decision` starts with `approved`. No match → fail closed (do not send deny or the first listed choice).
- Wall-clock timeout (`AGENT_LOOP_MUSE_TIMEOUT_MS`, default 45m) and approval-decide failures call `client.close()` immediately so `muse serve` does not keep running until loop unwind.
- When `reviewRuntime: "muse"`, judge defaults to PAYG **`muse-spark-1.3`** (same Spark as the contributor worker; omit `escalateModel`).
- Manual smoke: `pnpm agent:check:muse` (SDK + PATH `muse` + local `muse serve` handshake). Then a frozen loop with `--runtime muse` when you want a paid turn.

See [`docs/runtime-map.md`](./runtime-map.md).

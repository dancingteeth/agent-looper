---
tags:
  - documentation
  - runtimes
  - dsh
  - cost
  - agents
---
# DeepSeek Harness worker runtime

`runtime: dsh` spawns the **`dsh` CLI** already on PATH: one `dsh --profile headless "…"` process **per outer-loop iteration**. There is no `@deepseek-ai/dsh` dependency on the Agent Looper package.

The DSH **companion plugin** (`plugins/dsh-agent-looper/`) freezes GOAL + verify, then starts `agent-loop run` as **background bash** (`run_in_background: true`). Foreground grind is still blocked. Each iteration still spawns `dsh --profile headless`. From `dsh web`, if that bash cannot write `~/.dsh/profiles/headless/`, retry once with `sandbox_permissions: danger-full-access`.

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "dsh"` to judge with headless DSH too.

## Call shape

Headless has **no `--model` flag**. The harness writes a temp `--patch` YAML that sets `agent-default-model`, unattended `approval: never` / `sandbox: workspace-write`, and a matching permission preset (`workspace-write-never`). Stock DSH presets are only `workspace-write`+`ask` and `danger-full-access`+`never`; the extra preset is required so headless boot does not throw `configure defaultPreset explicitly`.

Then:

```bash
dsh --profile headless --patch /tmp/agent-loop-dsh-….yml "<system + user prompt>"
```

Stdout is the last assistant message. Exit non-zero fails the iteration. On the 45-minute cap, the harness SIGTERMs the headless **process group**, then SIGKILL after 3s.

## How to test

**CI / no live DeepSeek spend**

- `pnpm exec vitest run src/agents/dshAgent.test.ts` — patch YAML (including `workspace-write-never`), spawn timeout, Node floor
- `pnpm exec vitest run src/agents/agentRunner.test.ts src/loop/loopAgentConfig.test.ts` — `runtime: dsh` wiring
- `pnpm exec agent-check dsh` — PATH `dsh`, Node ≥ 22.15, credentials hint (does not call the API)

**Live (manual, later)**

- One-iteration smoke: freeze a tiny loop in the same git checkout the worker must edit (`runtime: dsh`, `reviewGate: false`), then `agent-loop run` from a host shell on Node 22.15+
- Headless `workspace-write` is rooted at that session cwd — pasting another repo path does not retarget writes
- Cost-bench token/$ for DSH waits until headless returns usage into `loopUsage`

## Install

```bash
# Node ≥ 22.15 (DSH zlib/zstd). dsh on PATH.
export DEEPSEEK_API_KEY=…   # or DSH credentials-local / settings
agent-check dsh
```

## Defaults

| Field | Default |
| --- | --- |
| `model` | `deepseek-official/deepseek-v4-flash` |
| `escalateModel` | `deepseek-official/deepseek-v4-pro` |
| `reviewModel` (when `reviewRuntime: "dsh"`) | `deepseek-official/deepseek-v4-pro` |

Slugs are `provider/model` for the headless `agent-default-model` row (`provider: deepseek-official`, `model: deepseek-v4-flash`).

## Example

```json
{
  "runtime": "dsh",
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true
}
```

DSH worker + DSH V4 Pro judge:

```json
{
  "runtime": "dsh",
  "reviewRuntime": "dsh",
  "verify": "bash .cursor/loops/my-task/verify.sh"
}
```

## Related

- Companion plugin: [`docs/dsh-plugin.md`](./dsh-plugin.md)
- Runtime map: [`docs/runtime-map.md`](./runtime-map.md)

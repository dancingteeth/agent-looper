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

The DSH **companion plugin** (`plugins/dsh-agent-looper/`) freezes GOAL + verify, then starts `agent-loop run` as **background bash** (`run_in_background: true`). Foreground grind is still blocked. Each iteration still spawns `dsh --profile headless`. From `dsh web`, switch the session to **Full Access** (or start that bash with `sandbox_permissions: danger-full-access`) so headless can write `~/.dsh/profiles/headless/` — see [Web session Full Access](#web-session-full-access).

Default judge stays Cursor (`reviewRuntime` unset). Set `reviewRuntime: "dsh"` to judge with headless DSH too.

## Call shape

Headless has **no `--model` flag**. The harness writes a temp `--patch` YAML that sets `agent-default-model`, unattended `approval: never` / `sandbox: workspace-write`, and a matching permission preset (`workspace-write-never`). Stock DSH presets are only `workspace-write`+`ask` and `danger-full-access`+`never`; the extra preset is required so headless boot does not throw `configure defaultPreset explicitly`.

Then:

```bash
dsh --profile headless --patch /tmp/agent-loop-dsh-….yml "<system + user prompt>"
```

Stdout is the last assistant message (no tool timeline). Exit non-zero fails the iteration. The harness waits on the process **`close`** event so piped stdout/stderr finish draining before the exit code is read. On the 45-minute cap, it SIGTERMs the headless **process group and descendant PIDs** (MCP grandchildren that left the group), then SIGKILL after 3s. A parent-death reaper kills the tree if the harness process is SIGKILL’d.

## Web session Full Access

Two different sandboxes:

| Layer | Default | What it gates |
| --- | --- | --- |
| **`dsh web` session** (this GUI) | `workspace-write` | The bash that *starts* `agent-loop` |
| **Headless worker** (`runtime: dsh`) | `workspace-write` + `approval: never` (harness `--patch`) | Files the implementer may edit |

The nested `dsh --profile headless` process always prepares `~/.dsh/profiles/headless/cordis.yml`. That path is **outside** the consumer workspace, so a web session left on **workspace-write** fails the first grind:

```text
EPERM: operation not permitted, open '…/.dsh/profiles/headless/cordis.yml'
```

Harness exit is then 2 (`DSH headless failed`). That is the sandbox, not a bad GOAL.

**Do this in `dsh web` before starting a `runtime: dsh` grind** (either is enough):

1. Switch the session permission preset to **Full Access** (`danger-full-access`) in the GUI, then start the background grind as usual, **or**
2. Keep workspace-write for freeze/design, but start the grind bash with `sandbox_permissions: danger-full-access` and a one-sentence justification (headless must write `~/.dsh/profiles/headless/`). Do this on the **first** grind call — do not burn an iteration waiting for EPERM.

If you already hit the denial, retry **once** with Full Access / that bash flag. Do not grep credentials files. Host-terminal `agent-loop run` (no web sandbox) does not need this switch.

Full Access on the **web** session does not change the headless worker patch: the implementer stays `workspace-write-never` inside the product repo.

## How to test

**CI / no live DeepSeek spend**

- `pnpm exec vitest run src/agents/dshAgent.test.ts` — patch YAML (including `workspace-write-never`), spawn timeout, Node floor
- `pnpm exec vitest run src/agents/agentRunner.test.ts src/loop/loopAgentConfig.test.ts` — `runtime: dsh` wiring
- In **this checkout** (package bins are not on `pnpm exec` until the package is a dependency): `node dist/cli/check.js dsh` or `pnpm agent:check:dsh`. Consumers: `pnpm exec agent-check dsh`.

**Live (manual)**

- One-iteration smoke: freeze a tiny loop in the same git checkout the worker must edit (`runtime: dsh`, `reviewGate: false`), then `agent-loop run` from a host shell on Node 22.15+
- Headless `workspace-write` is rooted at that session cwd — pasting another repo path does not retarget writes
- Cost-bench token/$ for DSH waits until headless returns usage into `loopUsage`. Iteration completion (stdout + exit via `close`) has been exercised against a real `dsh` binary; CI still mocks spawn.

## Install

```bash
# Node ≥ 22.15 (DSH zlib/zstd). dsh on PATH.
export DEEPSEEK_API_KEY=…   # or DSH credentials-local / settings
# this checkout:
node dist/cli/check.js dsh
# consumer (agent-looper is a dependency):
pnpm exec agent-check dsh
```

## Defaults

| Field | Default |
| --- | --- |
| `model` | `deepseek-official/deepseek-v4-flash` |
| `escalateModel` | `deepseek-official/deepseek-v4-pro` |
| `reviewModel` (when `reviewRuntime: "dsh"`) | `deepseek-official/deepseek-v4-pro` |

Setup also lists **`deepseek-official/deepseek-v4-flash-vision-exp`**. The official API accepts images on that id. DSH still **advertises text-only** unless the catalog row sets `inputModalities: [text, image]` (omission means text). `read_image` then errors `does not declare image input` — that is a local catalog gate, not a dead endpoint.

Headless `--patch` adds that row when the worker slug contains `vision`. **`~/.dsh/settings.yaml` `llm-deepseek.models` replaces the catalog wholesale** and outranks the patch, so the GUI (and headless, if settings lists models) must declare image on the vision entry too:

```yaml
llm-deepseek:
  models:
    - id: deepseek-v4-flash
      name: DeepSeek-V4-Flash
    - id: deepseek-v4-pro
      name: DeepSeek-V4-Pro
    - id: deepseek-v4-flash-vision-exp
      name: DeepSeek-V4-Flash-Vision-Exp
      inputModalities: [text, image]
```

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

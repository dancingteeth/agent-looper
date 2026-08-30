---
tags:
  - documentation
  - plugins
  - agents
  - loops
  - agentic_ai
---
# DeepSeek Harness companion plugin

Agent Looper’s **DSH** companion lives at [`plugins/dsh-agent-looper/`](../plugins/dsh-agent-looper/). It is a Cordis bundle (`dsh.bundle` + `cordis.patch.yml`) that loads inside `dsh web`.

It packages **skills, a human command, an always-on system-prompt section, and a bash guard** that teach DSH how to design loops and start the npm harness. It does **not** replace `@dancingteeth/agent-looper`, and it does **not** treat DSH’s built-in `/loop` / `/goal` as the finish line — shell `verify` via `agent-loop run` remains the wedge. After freeze, start the grind with bash **`run_in_background: true`** (stock DSH jobs: `job_output` / `job_kill`). Foreground `agent-loop run` is denied (~60s bash timeout). Prefer `runtime: dsh` so the worker is headless DSH — see [`dsh-runtime.md`](./dsh-runtime.md).

From `dsh web`, switch the session to **Full Access** (or start the grind bash with `sandbox_permissions: danger-full-access`) so nested headless can write `~/.dsh/profiles/headless/cordis.yml`. Workspace-write on the web session EPERMs that path. Details: [`dsh-runtime.md` — Web session Full Access](./dsh-runtime.md#web-session-full-access).

## What it ships

| Component | Purpose |
| --- | --- |
| Skills `design-loop`, `install-agent-looper`, `review-gate`, `check-running-loops`, `run-loop-in-dsh` | Shared four copied from [`plugins/agent-looper/skills/`](../plugins/agent-looper/skills/) (SSOT) via `materialize-skills`; `run-loop-in-dsh` is DSH-only |
| Command `loop-scaffold` | Guided GOAL + verify scaffold (direct UI handler — not sent to the model) |
| System prompt `plugin:agent-looper` | Always-on routing: plugin is already loaded; do not inspect DSH internals |
| Bash guard | Denies *foreground* `agent-loop run` and Doppler / DSH credentials-local / OpenCode secret dumps. Background grind is allowed (`blockNestedRun` toggles the foreground deny). |
| `cordis.patch.yml` | Inserts plugin row `id: agent-looper` |

Parity reference: [`plugins/agent-looper/`](../plugins/agent-looper/) and [`docs/cursor-marketplace-plugin.md`](./cursor-marketplace-plugin.md). Harness heartbeat (`ps` + `watch-status.json`) is runtime-agnostic; Cursor Agent Shell terminal files are an extra probe in `check-running-loops` when the grind was started from that chat.

## Install

DSH’s production loader imports `package.json` `"main"` as Node ESM — it does **not** transpile TypeScript. Build first. DSH 0.1.x also needs **Node ≥ 22.15** (`zlib.createZstdDecompress`); 22.14 fails before our plugin loads.

From this repository checkout:

```bash
node plugins/dsh-agent-looper/scripts/materialize-skills.mjs
pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json
dsh plugin --profile web add ./plugins/dsh-agent-looper
dsh --profile web --dump-config   # layer present without booting
dsh web
```

The bundle manifest is `@dancingteeth/dsh-agent-looper` (`plugins/dsh-agent-looper/package.json`). The root CLI package intentionally has **no** `dsh.bundle` and **no** runtime dependency on `@deepseek-ai/dsh`.

## Configure

Optional row config (Schemastery `Config` on the plugin module):

| Field | Default | Role |
| --- | --- | --- |
| `skillsDir` | `./skills` | Directory of bundled `skills/*/SKILL.md` |
| `agentLoopBinary` | `agent-loop` | CLI name referenced in guidance |
| `blockNestedRun` | `true` | Deny *foreground* `agent-loop run` (60s bash timeout). Background jobs (`run_in_background: true`) are allowed. Secret-file dumps are always denied. |

Example profile patch override:

```yaml
- id: agent-looper
  name: '@dancingteeth/dsh-agent-looper'
  config:
    agentLoopBinary: agent-loop
    blockNestedRun: true
```

## Verify in this repo

Offline (CI — no live `dsh web`):

- `bash .cursor/loops/dsh-plugin/verify.sh` — bundle layout, named exports, skills, bash guard (installs plugin deps via `pnpm test:dsh-plugin:deps` first)
- `pnpm test:dsh-plugin:deps && pnpm exec vitest run plugins/dsh-agent-looper/src/index.test.ts` — nested-run / secret-dump guards (plugin `node_modules` are not part of the root install)

Live (manual): `pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json` then `dsh plugin --profile web add ./plugins/dsh-agent-looper`. Freeze loops in the **same** workspace as the product repo. Start `dsh web` from that cwd. Before a `runtime: dsh` grind, set the session to **Full Access** (see runtime doc above).

## Related

- Cursor marketplace companion: [`docs/cursor-marketplace-plugin.md`](./cursor-marketplace-plugin.md)
- Agent Plugins (skills-only client): [`docs/agent-plugins.md`](./agent-plugins.md)
- DSH docs: [first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/), [package a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish), [skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills), [commands](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands), [system prompt](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/system-prompt), [tools](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/tools)

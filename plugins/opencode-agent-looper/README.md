# Agent Looper (OpenCode companion plugin)

Design, freeze, and start **[Agent Looper](https://www.npmjs.com/package/@dancingteeth/agent-looper)** loops from an [OpenCode](https://opencode.ai) session. This plugin **does not** replace the `@dancingteeth/agent-looper` CLI — it teaches the OpenCode agent how to use it and starts grinds safely.

Works on **OpenCode 1.x** (`server` hooks) and **2.x** (`setup` plugin API) from the same default export.

## What you get

| Component | 1.x | 2.x | Purpose |
| --- | --- | --- | --- |
| Skills `design-loop`, `review-gate`, `check-running-loops`, `run-loop-in-opencode` | via `agent_looper_skill` tool | native skills | Freeze `GOAL.md` + `verify.sh`, judge config, heartbeat, run guidance |
| Tool `agent_loop_start` | ✓ | ✓ | Spawns `agent-loop run <dir>` detached (survives shell timeouts); writes `opencode-grind.log` / `.pid` in the loop dir |
| Tool `agent_loop_status` | ✓ | ✓ | running / dead / done + log tail + runtime-agnostic heartbeat |
| Shell guard | ✓ | ✓ | Denies foreground `agent-loop run` / `agent-loop-batch` (the shell tool times out and kills the grind). **Best-effort tripwire** on literal command text, not a sandbox. `blockNestedRun: false` disables it. |
| `/loop-scaffold` command | ✓ | — | Guided GOAL + verify scaffold |

Inside a harness worker (`runtime: opencode`, where the harness sets `AGENT_LOOP_WORKER=1` on its own `opencode serve`), only the guard loads — workers are not taught to start nested grinds.

## Install

OpenCode **2.x**:

```bash
opencode plugin add @dancingteeth/opencode-agent-looper
```

That writes `"plugins": ["@dancingteeth/opencode-agent-looper"]` to your global `opencode.json`.

OpenCode **1.x** (the key is singular there, and 2.x ignores it):

```jsonc
// opencode.json
{
  "plugin": ["@dancingteeth/opencode-agent-looper"]
}
```

Then in the repo you want to loop:

```bash
pnpm add -D @dancingteeth/agent-looper
pnpm exec agent-loop-init
```

Options (1.x: `["@dancingteeth/opencode-agent-looper", { ... }]`):

| Option | Default | |
| --- | --- | --- |
| `agentLoopBinary` | `node_modules/.bin/agent-loop`, else `agent-loop` on PATH | Binary `agent_loop_start` runs |
| `launchPrefix` | none | Command words put before `agent-loop run`, e.g. `["doppler","run","--project","p","--config","dev","--"]` |
| `blockNestedRun` | `true` | Shell guard |
| `skillsDir` | bundled `skills/` | Relative to the package root |

### Runtime keys

`agent_loop_start` inherits the **OpenCode server** environment, not your shell, so keys like `CURSOR_API_KEY` are usually not there. It launches, in order: `launchPrefix` if set; else the repo's **`agent:loop`** package script through the repo's package manager (the usual place for `doppler run -- agent-loop run`); else plain `agent-loop run`. An explicit `agentLoopBinary` skips the script.

## Local development

From this repository checkout:

```bash
pnpm --dir plugins/opencode-agent-looper install
pnpm --dir plugins/opencode-agent-looper build   # syncs shared skills from ../agent-looper, then tsc
```

Point a project at the build with `.opencode/plugins/agent-looper.js`:

```js
export { default } from '/abs/path/to/agent-loop/plugins/opencode-agent-looper/dist/index.js'
```

`design-loop`, `review-gate`, and `check-running-loops` are copied from [`plugins/agent-looper/skills/`](../agent-looper/skills/) at build time (single source of truth); only `run-loop-in-opencode` lives here.

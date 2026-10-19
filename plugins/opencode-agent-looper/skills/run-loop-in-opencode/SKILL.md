---
name: run-loop-in-opencode
description: Install Agent Looper and start a frozen loop from OpenCode with the agent_loop_start tool. Use when the user asks to add the harness, grind, run, or implement a loop from an OpenCode session. Do not foreground-bash the grind.
tags:
  - agentic_ai
  - agents
  - loops
  - opencode
---

# Run Agent Looper from OpenCode

This session **designs and freezes**, then **starts** the harness. It is not the implementer — that is `runtime` in `loop.json` (`opencode` works: the harness drives its own headless `opencode serve`).

## Install (once per repo)

```bash
pnpm add -D @dancingteeth/agent-looper @opencode-ai/sdk
pnpm exec agent-loop-init
```

Humans pick runtime/models with `pnpm exec agent-loop-setup` (TUI — do not run it from this session). For an OpenCode Go worker, `runtime: opencode` with `OPENCODE_API_KEY` set in the user's environment. Never print or cat auth files.

## Start a grind

1. Confirm the bundle is frozen at `.cursor/loops/<name>/` (`GOAL.md`, `verify.sh`, `loop.json`). Load `design-loop` if it is not.
2. Call **`agent_loop_start`** with `loopDir` (on OpenCode 2.x, through `execute`: `tools.agent_loop_start({ loopDir })`). It spawns the grind detached, writes `opencode-grind.log` + `opencode-grind.pid` in the loop dir, and returns immediately.
3. Tell the user the PID and log path. Do not busy-poll.
4. When asked how it is going, call **`agent_loop_status`**. `done: complete` / `done: NOT complete` come from the harness `AGENT_LOOP_DONE` line.
5. One grind per loop dir. `agent_loop_start` refuses while the previous PID is alive.

## Keys and launch

The grind inherits the **OpenCode server** environment, not your shell, so runtime keys (`CURSOR_API_KEY`, …) are usually missing there. `agent_loop_start` launches, in order:

1. the plugin's `launchPrefix` option, e.g. `["doppler","run","--project","<p>","--config","dev","--"]`;
2. the repo's **`agent:loop`** package script, e.g. `"agent:loop": "doppler run --project <p> --config dev -- agent-loop run"`;
3. plain `agent-loop run`.

If the log says a key is missing, the fix is (1) or (2), or starting OpenCode under the secret manager. Retrying will not help. Never print, cat, or export secrets from this session.

Do **not** run `agent-loop run` / `agent-loop-batch` in a foreground shell: it times out long before a grind ends and kills it. A 2.x `background: true` shell job is allowed; `agent_loop_start` is still preferred (pid, log, status). `--help` is fine.

## Finish line

Shell `verify` via `@dancingteeth/agent-looper`. Do not edit `GOAL.md`, `verify.sh`, `loop.json`, or `RESEARCH.md` mid-run — the harness restores them.

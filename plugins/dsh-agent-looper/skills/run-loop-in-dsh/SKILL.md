---
name: run-loop-in-dsh
description: After a loop is frozen, start agent-loop as DSH background bash. Use when the user asks to grind from dsh web. Do not foreground-bash the grind.
tags:
  - agentic_ai
  - agents
  - loops
  - dsh
---

# Run Agent Looper from DSH

This chat **designs and freezes**, then **starts** the harness as a **background job**. It is not the implementer (that is `runtime` in loop.json — often `dsh` headless).

## Finish line

Shell `verify` via `@dancingteeth/agent-looper`. DSH `/loop` and `/goal` are a different product.

## Do this here

1. Confirm the bundle is frozen at `.cursor/loops/<name>/` (`GOAL.md`, `verify.sh`, `loop.json`).
2. Confirm `pnpm exec agent-loop --help` works (else `install-agent-looper`).
3. Start **one** grind with bash **`run_in_background: true`** (required). Foreground bash times out (~60s).
4. Tell the user the job id. Use `job_output` when you need logs; `job_kill` to stop. Do not busy-poll.
5. Do **not** start a second `agent-loop run` while one is `running`. Check `job_list` first.

Example bash call (schema fields, not a host terminal):

```text
command: pnpm exec agent-loop run .cursor/loops/<name>
description: Agent Looper grind for <name>
run_in_background: true
```

From this repo checkout, `node dist/cli/run.js .cursor/loops/<name>` is equivalent if bins are missing — still **`run_in_background: true`** (foreground of that argv is also blocked).

If Doppler wraps the CLI and the directory is not scoped:

```text
command: doppler run --project <name> --config <config> -- pnpm exec agent-loop run .cursor/loops/<name>
description: Agent Looper grind (Doppler env)
run_in_background: true
```

Prefer `runtime: dsh` in loop.json so the worker is headless DSH (this session’s DeepSeek credits / credentials-local). Unset `reviewRuntime` still judges on Cursor unless you set `"reviewRuntime": "dsh"`. Do **not** set `runtime: opencode` + `opencode-go/…` — that model is DSH-private and standalone OpenCode cannot load it.

From **`dsh web`**, nested headless writes `~/.dsh/profiles/headless/cordis.yml` (outside the workspace). **Do not start the grind on workspace-write.** Either:

1. Ask the human to switch the session permission to **Full Access**, then start the grind, **or**
2. Start the grind bash on the **first** call with `sandbox_permissions: danger-full-access` and a one-sentence justification (headless must write that profile).

Example (schema fields, not a host terminal):

```text
command: pnpm exec agent-loop run .cursor/loops/<name>
description: Agent Looper grind for <name>
run_in_background: true
sandbox_permissions: danger-full-access
justification: Nested dsh --profile headless writes ~/.dsh/profiles/headless/ outside the workspace.
```

If the first attempt already failed with `EPERM` on `cordis.yml` or `[sandbox: file access denied]`, retry **once** the same way. Do not grep credentials files. Host-terminal grinds do not need this switch.

## Do not do this here

- Foreground `agent-loop run` / `pnpm run agent:loop` / `node dist/cli/run.js <loop-dir>` (the companion guard blocks it)
- Implement the product yourself
- Dump Doppler YAML, `doppler secrets`, DSH `~/.dsh/.credentials.yaml`, or OpenCode `auth.json`
- SSH-enumerate or rsync “so the worker has context” — put paths in GOAL.md
- Repair dangling `~/.agents/skills/*/SKILL.md` from this chat — OpenCode boot auto-heals Cursor plugin-cache hash rotations (relink or drop)

## Session caveat

Closing this DSH **session** cancels owned background jobs. Restarting `dsh web` drops in-memory jobs. Say that if the user is about to close the tab.

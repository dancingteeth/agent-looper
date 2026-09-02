---
name: check-running-loops
description: >-
  Checks whether agent-loop / agent-loop-batch jobs are actually alive, stale, hung, dead, or done,
  for any worker/judge runtime (Cursor, Cline, OpenCode, Pi, Codex, DSH, Muse).
  Use when the user asks if loops are ok, stuck, running, healthy, or what the current batch status is;
  when they mention agent-loop, loop-batch, verify.sh harness, or AGENT_LOOP_DONE.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# Check running loops

The harness (`agent-loop` / `agent-loop-batch`) is the process to check. Worker and judge may be Cursor, Cline, OpenCode, Pi, Codex, DSH, or Muse — that does not change the heartbeat.

Do **not** answer loop health from memory, an IDE job list, Cursor terminal `status: running`, or `running_for_ms`. Those stay `running` after the process dies.

## Must run first

From the **consumer repo root** (the project being looped). The heartbeat script is `scripts/check-running-loops.sh` next to this `SKILL.md`. After `agent-loop-init` that is:

```bash
sh ".cursor/skills/check-running-loops/scripts/check-running-loops.sh" "$(pwd)"
# or: .agents/skills/check-running-loops/scripts/check-running-loops.sh
```

In this harness checkout the same files also live at `plugins/agent-looper/skills/check-running-loops/scripts/check-running-loops.sh`.

Optional: `STALE_SECS=180 HUNG_SECS=600` (defaults: 3 min stale, 10 min hung).

Heartbeat, in order:

1. `ps` — `agent-loop run` / `agent-loop-batch` PIDs (runtime-agnostic)
2. `.cursor/loops/*/watch-status.json` — `pid` + file mtime (written by `run`, any runtime)
3. Cursor Agent Shell terminal files — extra probe **only if** the grind was started from that chat (`CURSOR_TERMINALS_DIR` or `~/.cursor/projects/<slug>/terminals`). When the grind was started from a **sibling** Cursor window (harness vs consumer repo), the script also scans `$CURSOR_PROJECTS_DIR/*/terminals` (default `~/.cursor/projects`) for files whose `cwd:` matches this repo. Set `CURSOR_TERMINALS_DIR` to pin a single folder (tests / explicit).

Optional corroboration for a known loop dir (`watch --snapshot` is not the heartbeat — `log.ndjson` often does not grow during a worker/judge think stretch):

```bash
pnpm exec agent-loop watch --snapshot .cursor/loops/<name>
```

## Classify

| Script `verdict` | Meaning |
| --- | --- |
| `ALIVE` | `ps` has the PID and log age &lt; stale |
| `ALIVE_BUT_STALE` | PID live, no log growth for ≥ 3 min — do not call this healthy |
| `ALIVE_BUT_HUNG` | PID live, no log growth for ≥ 10 min — hung or judge/worker stall |
| `DEAD` | PID gone, no `AGENT_LOOP_DONE` |
| `DONE` | PID gone, `AGENT_LOOP_DONE` in the log |
| `NONE` | No harness process / no matching terminal / no recent loop dir |

`meta_status=running` with `ps=DEAD` → **DEAD**. Same if a DSH/Cline/OpenCode job UI still says running.

Do not print full `ps`/`pgrep -fl` command lines (API keys have leaked there). The script prints PIDs only.

## What you may tell the user

Lead with **verdict + PID + log age + which loop + runtime**. Then last `iteration` / `verify` / `review gate` lines.

Forbidden unless `verdict=ALIVE` (fresh):

- “everything is ok”
- “harness is healthy”
- “still running” without `ps` + age

`ALIVE_BUT_STALE` / `ALIVE_BUT_HUNG`: say **quiet since Ns**, last phase (worker vs judge), not “ok”.

`DEAD` mid-batch: first finished loops vs where it died; offer resume (remaining `loop-batch.json` paths only — do not re-run verified loops unless asked).

## Why this exists

Host UIs are not a heartbeat. A worker/judge turn on any runtime can sit with no new log lines until that SDK’s timeout (Cursor: `AGENT_LOOP_CURSOR_TIMEOUT_MS`, default 45 min). Quiet `watch-status.json` / terminal log + live harness PID = stall, not success.

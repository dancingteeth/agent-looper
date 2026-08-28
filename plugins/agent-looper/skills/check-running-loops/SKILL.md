---
name: check-running-loops
description: >-
  Checks whether agent-loop / agent-loop-batch jobs are actually alive, stale, hung, dead, or done.
  Use when the user asks if loops are ok, stuck, running, healthy, or what the current batch status is;
  when they mention agent-loop, loop-batch, verify.sh harness, or AGENT_LOOP_DONE.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# Check running loops

Cursor-only. Do **not** answer loop health from memory, Cursor terminal `status: running`, or `running_for_ms`. Those stay `running` after the process dies.

## Must run first

From the **consumer repo root** (the project being looped). The script sits next to this `SKILL.md`:

```bash
sh "<this-skill-dir>/scripts/check-running-loops.sh" "$(pwd)"
```

In this harness checkout that path is `plugins/agent-looper/skills/check-running-loops/scripts/check-running-loops.sh`.

Optional: `STALE_SECS=180 HUNG_SECS=600` (defaults: 3 min stale, 10 min hung). Override `CURSOR_TERMINALS_DIR` when terminals are not under `~/.cursor/projects/<slug>/terminals`.

Optional extra for a known loop dir (corroboration, not the heartbeat):

```bash
pnpm exec agent-loop watch --snapshot .cursor/loops/<name>
```

`watch --snapshot` reads `watch-status.json` / `log.ndjson`. `log.ndjson` is often **not** updated during a worker/judge think stretch. Treat a fresh **terminal log mtime** + live **PID** as the heartbeat; use `watch-status.json` `pid` + file mtime for the loop-dir line.

## Classify

| Script `verdict` | Meaning |
| --- | --- |
| `ALIVE` | `ps` has the PID and log age &lt; stale |
| `ALIVE_BUT_STALE` | PID live, no log growth for ≥ 3 min — do not call this healthy |
| `ALIVE_BUT_HUNG` | PID live, no log growth for ≥ 10 min — hung or judge/worker stall |
| `DEAD` | PID gone, no `AGENT_LOOP_DONE` |
| `DONE` | PID gone, `AGENT_LOOP_DONE` in the log |
| `NONE` | No harness process / no matching terminal |

`meta_status=running` with `ps=DEAD` → **DEAD**. Say that.

Do not print full `ps`/`pgrep -fl` command lines (API keys have leaked there). The script prints PIDs only.

## What you may tell the user

Lead with **verdict + PID + log age + which loop**. Then last `iteration` / `verify` / `review gate` lines.

Forbidden unless `verdict=ALIVE` (fresh):

- “everything is ok”
- “harness is healthy”
- “still running” without `ps` + age

`ALIVE_BUT_STALE` / `ALIVE_BUT_HUNG`: say **quiet since Ns**, last phase (worker vs judge), not “ok”.

`DEAD` mid-batch: first finished loops vs where it died; offer resume (remaining `loop-batch.json` paths only — do not re-run verified loops unless asked).

## Why this exists

Cursor terminal metadata is not a heartbeat. A worker/judge turn can also sit in `RUNNING` with no new tool lines until `AGENT_LOOP_CURSOR_TIMEOUT_MS` (default 45 min). Quiet log + live PID = stall, not success.

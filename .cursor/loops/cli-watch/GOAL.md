---
tags:
  - documentation
  - agents
  - loops
---
# cli-watch — live loop progress (TTY Watch + always-on phase lines)

## Finish line (four parts)

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal | Humans see GOAL → WORKER → VERIFY → JUDGE while a run is alive, including non-TTY |
| **Scoreboard** | `verify.sh` | Focused vitest + `--help` / `--snapshot` CLI smoke |
| **Permission** | `loop.json` | `maxIterations` 10 / `stagnationThreshold` 3 |
| **Budget** | below | Stop when verify is green. Do not add pause/detach keybinds |

## Goal

After `agent-loop run` starts, the user currently gets a long quiet stretch while the worker thinks. Fix **visibility**, not a fleet dashboard.

1. **Always** (TTY and non-TTY): emit structured phase lines on stderr so Cursor background / CI can see progress:
   `[agent-loop] phase=WORKER iteration=1/8 elapsed=12s cost~$0.04`
   While phase is WORKER or JUDGE, repeat a heartbeat line at least every 15s with updated elapsed (fakeable clock in tests).
2. **When stderr is a TTY** and `--plain` is not set: render an Ink Watch view using the same terracotta / verify-green chrome, figure-8 mark, and stage pills as `setupTui.tsx` (extract shared chrome if needed — do not fork a second palette).
3. **`agent-loop watch <loop-dir>`** subcommand (dispatch beside existing `run`; do not add a new `package.json` bin). Default is live-tail of `log.ndjson` + current phase. **`--snapshot`** prints one frame from on-disk artifacts and exits 0 (the verifier uses this; no PTY required).

Wire `runAgentLoop` with an `onPhase` (or equivalent) callback so the CLI and tests do not scrape private internals. Reuse `onIterationStart` if it stays; do not remove it.

## Golden

`src/cli/setupTui.tsx` stage pills (`GOAL` `WORKER` `VERIFY` `JUDGE`), figure-8, terracotta `#D65D2E` / verify `#76A17B`. Watch frames must show those four stage names.

## Budget

- Stop when `verify.sh` exits 0.
- Do not implement `p` pause / `q` detach / a second supervisor process.
- Do not add `agent-loop ls`.

## Acceptance criteria

Success is **only** `verify.sh` exit 0.

1. `pnpm exec vitest run` on the Watch unit tests exits 0. Tests must cover:
   - `formatWatchStatusLine` (or equivalent) for phases GOAL, WORKER, VERIFY, JUDGE with iteration, elapsed, and cost.
   - Heartbeat: with a fake clock, a WORKER phase lasting >15s emits at least two status lines.
   - Ink Watch frame via `ink-testing-library` (same pattern as `setupTui.test.tsx`) contains GOAL, WORKER, VERIFY, JUDGE and the figure-8 / Agent Looper chrome.
   - `runAgentLoop` invokes `onPhase` (or the new hook) at least once per implement and once per verify in the existing agentLoop test harness.
2. After `pnpm build`, `node dist/cli/run.js watch --help` mentions `watch`, `--snapshot`, and `--plain`.
3. `node dist/cli/run.js watch --snapshot <dir>` against a temp dir whose `log.ndjson` is copied from `.cursor/loops/cli-watch/fixtures/snapshot-loop/snapshot.ndjson` (do not commit `log.ndjson` under `.cursor/loops/` — it is gitignored) prints WORKER or VERIFY (or both) and exits 0.
4. `parseRunArgs(['some-loop'])` still runs that loop dir; `watch` is not treated as a loop path. Existing `run` subcommand skip still works.

## Unknowns accepted

- Ink on a non-TTY must not hang; fall back to phase lines.
- Live attach without `--snapshot` is dogfood; verify does not drive a PTY.
- Cost on the line may be estimated (`costSource`); do not invent provider accuracy.

## Constraints

- Paths: `src/cli/` (watch TUI, run dispatch, runArgs), `src/loop/agentLoop.ts` (phase hook only), tests next to those files, `scripts/dist-manifest.json` if new compiled modules are required, README/ARCHITECTURE CLI table if a subcommand is added.
- Extract shared chrome rather than copy-pasting `setupTui.tsx`.
- Do not edit this `GOAL.md`, `loop.json`, or `verify.sh` during the loop.
- Do not add npm dependencies except if `ink-testing-library` is missing from the test graph (it is already used).

## Out of scope

- Pause/detach keybinds, fleet `ls`, Telegram live updates, `maxCostUsd` (sibling loop `cli-max-cost`).
- Replacing `pauseAfterIteration` or `AGENT_LOOP_DONE`.
- Computer-use / browser verify.

## References

- `src/cli/setupTui.tsx`, `src/cli/setupTui.test.tsx`
- `src/loop/agentLoop.ts` (`onIterationStart`, iteration stderr)
- `src/cli/runArgs.ts` (`run` token skip)
- `.cursor/loops/cli-max-cost/` — cost cap is a different loop

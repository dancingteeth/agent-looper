---
tags:
  - documentation
  - agents
  - loops
---
# cli-resume-report — resume hints, report pointers, Telegram triage delta

## Finish line (four parts)

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal | Incomplete runs tell you the next command; reports point at full verify logs |
| **Scoreboard** | `verify.sh` | Focused vitest on report / Telegram / run-report formatters |
| **Permission** | `loop.json` | `maxIterations` 8 / `stagnationThreshold` 3 |
| **Budget** | below | Stop when verify is green. Do not add a `replay` command |

## Goal

When a loop dies, the user gets a reason string and has to know that re-running the same command continues the work (Ralph-resume: files/git persist; not process resume).

1. **Resume hint on non-complete exit** (CLI stderr *and* Telegram body): a line like
   `→ resume: agent-loop run <bundle-rel-path>`
   When status is `waiting` or a HITL UUID exists, also print `HITL: uuid:<uuid>` (already partly present — keep it and put it next to the resume line).
2. **`run-report.md` verify step**: stop inlining a 400-char verify blob as the only record. Keep a short status line (`PASS`/`FAIL`, exit, command) and a **relative link** to the sidecar files when `verifyLogMode` is `sidecar`, or to `log.ndjson` / verify-logs when present. Use existing `persistVerifyOutput` / `verify-logs/` — do not invent a new store.
3. **Telegram delta only**: `formatLoopCompletionReport` already includes status, reason, usage, review verdict, HITL, last verify snippet. Add (a) the resume command on failure, (b) one line from the latest `failure-domains.ndjson` when that file exists. Do not rebuild the report. No bot callback server.

## Budget

- Stop when verify is green.
- Do not add `agent-loop replay`. `agent-loop-export-run` stays the regenerator.

## Acceptance criteria

Success is **only** `verify.sh` exit 0.

1. Unit tests: incomplete `formatLoopCompletionReport` includes `resume:` and `agent-loop run`. Complete reports still include suggested git next-steps and do **not** need a resume line.
2. Unit tests: `formatVerifyStep` / `buildRunReportMarkdown` with sidecar verify logs includes a relative path (`verify-logs` or the persisted stdout file), not only a 400-char truncated copy.
3. Unit tests: when a loop dir has `failure-domains.ndjson`, the Telegram/completion report includes a one-line domain summary (reason or `status`).
4. Existing complete-report tests still pass (verdict + usage line remain).

## Constraints

- Paths: `src/loop/loopReport.ts`, `src/loop/loopRunReport.ts`, `src/cli/run.ts` (exit hint), tests, maybe `src/loop/loopFailureDomain.ts` for the one-liner. No new CLI binaries.
- Do not edit this `GOAL.md` / `loop.json` / `verify.sh` during the loop.
- Do not implement Watch or `maxCostUsd` (sibling loops).

## Out of scope

- `agent-loop ls`, Watch TUI, setup wizard, bot callbacks, Taskwarrior auto-resume.

## References

- `src/loop/loopReport.ts` (`formatLoopCompletionReport`, `formatSuccessNextSteps`)
- `src/loop/loopRunReport.ts` (`formatVerifyStep`, 400-char `truncate`)
- `src/loop/loopExtensions.ts` (`verifyLogMode: sidecar`)
- `src/cli/export-run.ts`

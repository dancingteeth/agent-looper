---
tags:
  - documentation
  - loops
  - planning
  - agents
---
# Import shadcn/improve plans (`agent-loop-import`)

[shadcn/improve](https://github.com/shadcn/improve) is an agent skill: a strong model audits a repo and writes `plans/NNN-slug.md`, self-contained specs meant for a cheaper model to execute. Each plan carries verification commands, machine-checkable done criteria, an in-scope file list, STOP conditions, and the commit it was written against.

That is most of a loop bundle already. `agent-loop-import` does the conversion, so improve writes the plan and Agent Looper runs it until green.

```bash
# in the target repo, after /improve wrote plans/
pnpm exec agent-loop-import plans/001-fix-n-plus-one.md      # one plan → one loop
pnpm exec agent-loop-import plans/                            # all open plans → loops + batch
pnpm exec agent-loop-import plans/ --dry-run                  # show what would be written

# review verify.sh / setup.sh, then
pnpm exec agent-loop run .cursor/loops/improve-001-fix-n-plus-one --trust-config
pnpm exec agent-loop-batch .cursor/loops/improve-batch --trust-config
```

Options: `--out <dir>` (loops root, default `.cursor/loops`), `--force` (overwrite generated bundles), `--repo-root <path>`.

## What maps to what

| In the plan | In the loop bundle |
| --- | --- |
| Done criteria with a command (`` `pnpm test` exits 0 ``, `` `grep …` returns no matches ``) | `verify.sh` checks: exit 0, or no output (exit ≤ 1, so grep's "no match" passes and a grep error fails) |
| "No files outside the in-scope list are modified" | `verify.sh` scope check: files changed since the run's baseline must be in the plan's **In scope** list |
| Done criteria with no command ("both commands call the helper") | listed as judge-checked in `GOAL.md`; turns on `reviewGate` + `postQualityReview` |
| No runnable Done criteria at all | falls back to the steps' **Verify** commands; with none of those either, the import fails (an empty `verify.sh` would always pass) |
| STOP conditions | `GOAL.md` tells the worker to write `STOP.md` in the loop dir and stop; `verify.sh` then exits 75 and the loop parks (`waiting`) for a human |
| `Planned at` commit + drift-check paths | `setup.sh` exits 75 (parks) if those files changed between that commit and the run's baseline |
| Commands table → Install row | runs in `setup.sh` (package-manager commands only) |
| Effort S / M / L | `maxIterations` 4 / 6 / 10 |
| Risk HIGH | `reviewGate` on |
| `plans/README.md` order, Depends on, status | `improve-batch/loop-batch.json` in dependency order; DONE / REJECTED / BLOCKED rows skipped, as are plans whose dependencies are neither DONE nor in the batch. `agent-loop-batch` stops at the first failing loop, so a dependent never runs on a broken base. |
| Maintenance notes → "Reviewer focus" | per-loop batch `rubric` |
| The plan text | frozen copy at the end of `GOAL.md` (the "update `plans/README.md`" instruction is dropped; the harness reports status) |

## What the importer will not copy

- Mutating or network commands in criteria (`git push/commit/reset/…`, `rm`, `curl`, `wget`, `sudo`, package installs, `| sh`) are left out of `verify.sh` with a warning.
- Template placeholders (`` `pnpm test -- <filter>` ``) are skipped; that criterion goes to the judge instead.
- A check whose expectation the plan does not state is assumed to be exit 0 and marked in `verify.sh`.

`verify.sh` and `setup.sh` still run shell commands taken from the plan. Read them before the first run; that is what `--trust-config` acknowledges.

## Baseline and state

`setup.sh` records `HEAD` and the paths that were already dirty under `$(git rev-parse --git-path agent-loop-import/<loop>)` on the first run. The scope check compares against that baseline and ignores the pre-existing dirt; the drift check compares the plan's commit with it, so the worker's own commits never count as drift. Delete that directory to re-baseline.

Escape hatch: `AGENT_LOOP_IGNORE_PLAN_DRIFT=1` skips the drift check after you have compared the plan's "Current state" excerpts with the code by hand. The better fix is `/improve reconcile`, then `agent-loop-import --force`.

## Why not improve's own `execute`

`/improve execute` dispatches one executor subagent in a worktree and allows two revision rounds. A loop adds a fresh worker each round on any runtime, a shell verifier as the hard gate, stagnation detection, the judge stack, HITL, and batch runs. The two fit together: improve writes the plan, Agent Looper runs it.

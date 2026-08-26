---
tags:
  - documentation
  - agents
  - loops
---
# cli-setup-detect — detect-first setup + dump-before-write

## Finish line (four parts)

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal | Wizard probes installed runtimes and shows the files it will write before writing them |
| **Scoreboard** | `verify.sh` | Existing setup fixtures still pass **plus** detect + dry-run checks |
| **Permission** | `loop.json` | `maxIterations` 8 / `stagnationThreshold` 3 |
| **Budget** | below | Stop when verify is green. No repair-mode rewrite of an existing repo |

## Goal

The setup TUI is 38 typical steps and asks questions it could often answer. Two changes:

1. **Detect-first:** before (or as) the worker-runtime menu, probe what is actually installed — same checks as `src/cli/check.ts` (try-import `@cursor/sdk`, `dsh` on PATH, etc.). Annotate choices `detected` / `missing`. Do **not** hide missing runtimes; humans may still pick them. Implement a pure `detectLoopRuntimes()` (or equivalent) with unit tests that mock `import` / `which` — **do not call `doctor.ts`** (doctor is dist + profile + pricing drift, not SDK presence).
2. **Dump-before-write:** `--answers` (and interactive commit) prints the exact `loop.json` object and repo-profile patch **before** writing. `--dry-run --answers <file> --out <dir>` prints that dump and exits 0 with **no** `loop.json` and **no** `.cursor/agent-loop.repo.json` written.

Keep `--answers` fixtures from `cli-setup-wizard` green. Do not add 38 more prompts.

## Budget

- Stop when verify is green.
- Repair-on-re-run (diff-and-heal an initialized repo) is **out of scope**.

## Acceptance criteria

Success is **only** `verify.sh` exit 0.

1. Existing `cli-setup-wizard` verifier still passes (`bash .cursor/loops/cli-setup-wizard/verify.sh`).
2. Unit tests: `detectLoopRuntimes` returns a structured map; a mocked missing `dsh` is `missing`; a mocked present cursor SDK is `detected`.
3. `--help` mentions `--dry-run` and detection (or “detected”).
4. `--dry-run --answers` fixture: stdout contains `"runtime"` (the dump) and the out dir has no `loop.json`.
5. Normal `--answers` (no dry-run) still writes `loop.json` (existing wizard verify covers this).

## Constraints

- Paths: `src/cli/setup.ts`, `src/cli/setupFlow.ts`, `src/cli/setupMenus.ts` if annotations need a field, new `src/cli/detectRuntimes.ts` (name flexible), tests. Do not rewrite `src/loop/` engine.
- Do not edit this `GOAL.md` / `loop.json` / `verify.sh` during the loop.

## Out of scope

- Watch, `maxCostUsd`, resume hints, fleet `ls`.
- Interactive last-screen edit/abort TUI (dump + `--dry-run` is the scoreboard). Repair mode.

## References

- `src/cli/check.ts` (SDK/env probes)
- `src/cli/doctor.ts` (wrong module — do not reuse as the detector)
- `.cursor/loops/cli-setup-wizard/` (must stay green)

---
tags:
  - documentation
  - agents
  - loops
---
# TW — Cross-loop meta-review CLI (M5)

**UUID:** `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00`

## Goal

Add a **read-only aggregator** that reviews **N completed loop bundles** and
emits one cross-loop report. Per-loop gates cannot see drift across many loops;
this CLI is the factory-scale residual judge.

```text
collect loop artifacts → build meta prompt → Cursor judge → meta-review report
```

**Does not** re-run implement workers or flip per-loop `complete` flags.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`). Checks live in
`verify.sh` / `VERIFY.skill.md`.

- New CLI (pick one surface, document in README):
  - `agent-loop meta-review <paths…>` subcommand on `run.js`, **or**
  - `agent-loop-meta-review` bin (mirror `agent-loop-review-run`).
- Input: one or more loop dirs and/or a parent dir (e.g. `.cursor/loops`) —
  discover child bundles that have `GOAL.md` + `loop.json`.
- **Collect** per loop (best-effort; missing files are noted, not fatal):
  - latest `review.md` / `review.N.md`
  - `log.ndjson`
  - `failure-domains.ndjson`
  - diff stat vs repo `defaultBranch` (reuse git helpers from `loopPostReview`)
- **Prompt** from `docs/meta-review-prompt.md` (load or inline a bounded brief;
  do not paste full unified-code-review skill).
- **Output:** single markdown report (default:
  `<out-dir>/meta-review.md` or `--output` path) with sections:
  `### Cross-loop themes`, `### HITL follow-ups`, standard verdict/risk/blockers.
- **Optional:** `--hitl` creates Taskwarrior tasks from `### HITL follow-ups`
  bullets (project from repo profile / `--project`); default off.
- Unit tests with fixture loop dirs — **no live Cursor SDK** in CI (mock judge).
- Stderr logs which loops were included and which artifacts were missing.

## Constraints

- Scope: `src/review/` (new `metaReview*.ts`), `src/cli/`, exports, tests,
  README + roadmap + dogfood touch.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not implement M4 Track B `verifyMode` or change per-loop review pipeline.
- Read-only: must not call `runAgentLoop` / implement workers.

## Out of scope

- Scheduling / cron / parallel worktrees
- Auto-closing loops or mutating `log.ndjson`
- Full unified-code-review skill inlined into the meta prompt

## References

- `docs/meta-review-prompt.md`
- `docs/loop-review-roadmap.md` §5
- `src/review/loopPostReview.ts` (git diff helpers)
- `src/cli/review-run.ts` (CLI pattern)
- Taskwarrior: `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00`

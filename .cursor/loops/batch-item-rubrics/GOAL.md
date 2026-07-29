---
tags:
  - documentation
  - agents
  - loops
---
# TW — M8 batch-item rubrics

**UUID:** `3fa3c394-ab59-420a-972a-3421194678aa`

## Goal

Extend `loop-batch.json` so each fan-out entry can carry an optional **rubric**
(equal verify pressure per unit — Thariq workflow pattern). When present, inject
the rubric into that loop’s worker prompt; shell `verify` remains the hard gate.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`).

- `loops[]` accepts either a string path **or** `{ "path": "...", "rubric": "..." }`.
- String entries keep today’s behavior (no rubric).
- Object entries with `rubric` pass the text into `runAgentLoop` → `buildAgentLoopPrompt`
  as a volatile **Batch rubric** section (after Workspace / before or with review guides).
- Rubric must not rewrite frozen `GOAL.md`; prompt-only injection.
- Unit tests for schema parse + prompt rendering + batch wiring (mock `runAgentLoop`).
- Docs: `templates/loop-batch.example.json` (or update existing batch template) + short note in
  `docs/competitive-steal-backlog.md` / README batch section if present.
- Export any new helpers from `src/index.ts` if public.

## Constraints

- Scope: `src/loop/loopBatch*.ts`, `loopPrompt.ts`, `agentLoop.ts` options, tests, templates/docs.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not change reviewGate / Guide packets behavior except where prompt ordering needs care
  (prefix cache: rubric is volatile — keep it in the volatile tail).
- Backward compatible: existing `loops: ["name"]` batches must still parse and run.

## Out of scope

- Parallel batch execution
- Rubric replacing shell verify
- Meta-loop probe/fix rubrics (optional follow-up)

## References

- `docs/competitive-steal-backlog.md` P2
- `src/loop/loopBatch.ts`
- Thariq / Claude Code workflows (per-item rubric)

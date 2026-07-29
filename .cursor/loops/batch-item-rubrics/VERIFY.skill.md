---
tags:
  - documentation
  - agents
  - loops
---
# VERIFY.skill.md — batch-item rubrics

## Checks

1. `loopBatchConfigSchema` parses mixed `loops` string and `{path,rubric}` entries.
2. Batch runner passes `batchRubric` into `runAgentLoop` when rubric is set.
3. `buildAgentLoopPrompt` renders `## Batch rubric` in the volatile tail when provided.
4. Existing string-only batches still work.
5. `tsc --noEmit` clean; focused vitest green.

## Rules

- Fail → fix → rerun. No partial handoff.
- Do not weaken tests to go green.

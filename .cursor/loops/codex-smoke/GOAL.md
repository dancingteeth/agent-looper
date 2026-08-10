---
tags:
  - documentation
  - dogfood
---
# Codex runtime smoke

Prove the harness can run a worker iteration with `runtime: codex` and pass shell verify.

## Acceptance criteria

1. Create **only** this file (overwrite if present): `.cursor/loops/codex-smoke/probe.txt`
2. The file must contain exactly one line: `codex-smoke-ok` (no extra whitespace or lines).

## Constraints

- Do **not** edit `GOAL.md`, `verify.sh`, or `loop.json`.
- Do **not** change any other files in the repo.

## Out of scope

- Refactors, docs, dependencies, or tests outside this probe file.

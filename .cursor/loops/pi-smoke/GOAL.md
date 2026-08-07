---
tags:
  - documentation
  - dogfood
---
# Pi OpenRouter runtime smoke

Prove the harness can run a worker iteration with `runtime: pi` (OpenRouter BYOK) and pass shell verify.

## Acceptance criteria

1. Create **only** this file (overwrite if present): `.cursor/loops/pi-smoke/probe.txt`
2. The file must contain exactly one line: `pi-smoke-ok` (no extra whitespace or lines).

## Constraints

- Do **not** edit `GOAL.md`, `verify.sh`, or `loop.json`.
- Do **not** change any other files in the repo.

## Out of scope

- Refactors, docs, dependencies, or tests outside this probe file.

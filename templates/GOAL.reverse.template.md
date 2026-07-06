---
tags:
  - documentation
  - agents
---
# Goal (reverse / clean-room mode)

Rebuild **<feature>** from tests and public API only — do not copy the existing implementation.

## Spec

- Behavior: …
- Public API / routes: …
- Tests that must pass: `pnpm test -- <pattern>`

## Constraints

- Read tests, specs, and GOAL.md — not legacy implementation internals.
- Prefer replacing implementation files over incremental patches.
- Stay within scope; do not add unrelated features.

## Done when

- `verify` in loop.json exits 0.
- No scope creep beyond this spec.

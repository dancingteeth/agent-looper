---
tags:
  - documentation
  - agents
  - loops
---
# Research — short title

Optional brownfield map, frozen **with** `GOAL.md`. Copy to `.cursor/loops/<name>/RESEARCH.md`.
Skip for tiny loops you already dogfooded.

The worker prompt **indexes** this path (does not paste the body). **Read** it before
the first edit. Do **not** edit this file mid-run. `verify.sh` is still the finish line —
if verify contradicts this map, trust verify.

A wrong line here is expensive. A human reads this before freeze. Throw it out if it
says the bug is invalid or names the wrong layer.

## Where

- Canonical files / modules the change should touch (paths, not vibes).
- What to leave alone.

## Data flow

- How input reaches those files and what comes out.
- Likely cause of the bug / gap, in one short paragraph.

## How this repo tests this area

- Existing tests, fixtures, or verify commands to extend — not a new TDD ritual.
- Conventions the worker would otherwise guess wrong.

## Open risks

- What this map might still be wrong about. Prefer "unknown" over a confident fiction.

---
tags:
  - documentation
  - agents
  - templates
---
# TW — Metric grind: {feature} under threshold

**UUID:** `<taskwarrior-uuid>`

## Goal

Improve **{metric}** for **{feature/path}** until the verifier’s measured value
meets the threshold. The loop may change implementation freely within Constraints;
it must not weaken the measurement harness.

## Metric (finish line)

| Field | Value |
| --- | --- |
| Metric | e.g. p95 latency of `GET /health` |
| How measured | Command/script that prints a single number (see `verify.sh`) |
| Threshold | e.g. `p95_ms <= 50` |
| Baseline (optional) | Record once before the first fix iter |

## Acceptance criteria

- Success is **only** `verify` exit `0` (threshold met), not the agent’s claim.
- Measurement command is deterministic enough to compare across iterations.
- Do not “pass” by deleting the check, raising the threshold mid-loop, or mocking away the path under test.

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Do **not** change the threshold or measurement method without stopping the loop and re-freezing.
- Scope: directories and files you list here.

## Out of scope

- Unrelated refactors, deploy, changing CI globally.

## References

- [`docs/unknowns-preflight.md`](../docs/unknowns-preflight.md) — list how measurement can flake before freezing
- [`docs/verification-as-skill.md`](../docs/verification-as-skill.md)

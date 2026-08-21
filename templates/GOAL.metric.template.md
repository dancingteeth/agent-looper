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

Lower-is-better (latency, error rate). Pair with `templates/verify.metric.example.sh`.

| Field | Value |
| --- | --- |
| Metric | e.g. p95 latency of `GET /health` |
| How measured | Command/script that prints a single number (see `verify.sh`) |
| Threshold | e.g. `p95_ms <= 50` |
| Baseline (optional) | Record once before the first fix iter |
| **Revert** | If measured **worse than baseline**, undo the last change — do not keep a regression and "keep iterating" |

## Finish line (four parts)

| Part | This loop |
| --- | --- |
| **Outcome** | Metric at or under threshold |
| **Scoreboard** | `verify.sh` exit `0` (threshold); fail-and-revert if worse than baseline |
| **Permission** | `loop.json` `maxIterations` / `stagnationThreshold` |
| **Budget** | Stop when iterations or spend are not worth another try — not "until perfect" |

## Acceptance criteria

- Success is **only** `verify` exit `0` (threshold met), not the agent’s claim.
- Measurement command is deterministic enough to compare across iterations.
- Do not “pass” by deleting the check, raising the threshold mid-loop, or mocking away the path under test.
- A result worse than baseline is a **revert**, not a candidate to keep.

## Constraints

- Do **not** edit this `GOAL.md` mid-loop.
- Do **not** change the threshold or measurement method without stopping the loop and re-freezing.
- Scope: directories and files you list here.

## Out of scope

- Unrelated refactors, deploy, changing CI globally.

## References

- [`docs/unknowns-preflight.md`](../docs/unknowns-preflight.md) — list how measurement can flake before freezing
- [`docs/verification-as-skill.md`](../docs/verification-as-skill.md)
- [`docs/competitive-steal-backlog.md`](../docs/competitive-steal-backlog.md) P7 — revert condition

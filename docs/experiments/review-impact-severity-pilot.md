---
tags:
  - documentation
  - experiments
  - loops
---
# Review impact-severity pilot

Offline experiment for roadmap **M1** (`8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6`).

## Goal

Measure whether gating only on `severity: error` + recognized `impact` reduces
irrelevant-blocker fix-loop thrash without missing real issues.

## Setup

1. Pick ~10 real merged PRs or finished loops (mixed risk: docs-only, logic, auth).
2. Run with `reviewGate: true` **before** and **after** impact-severity (or compare
   legacy bullets vs structured bullets on the same diffs).
3. Record results in a table below (one row per case).

## Scorecard (per case)

| Case | Real issue found? | Correct file:line? | Hallucinated blocker? | Fix rounds before pass | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | | | | | |
| … | | | | | |

## Pass criteria

- False-blocker rate (hallucinated or cosmetic gated) drops vs baseline.
- No regression on cases where a real `error` + `impact` blocker was needed.
- Reviewer uses `severity: warning impact: none` for cosmetic findings in ≥80% of nit cases.

## Commands

```bash
doppler run -- agent-loop run .cursor/loops/<case> --runtime cursor --review-gate
task 8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6 info
```

## Related

- [`loop-review-roadmap.md`](../loop-review-roadmap.md) §1
- [`loop-review-patterns.md`](../loop-review-patterns.md)

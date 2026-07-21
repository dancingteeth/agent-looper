---
tags:
  - documentation
  - loops
  - roadmap
---
# Meta-review prompt outline (M5)

Cross-loop residual review — **not** a per-loop gate. Does not flip loop
`complete` flags. Full unified-code-review skill is the process source; this
file is the **compressed judge brief** for `agent-loop meta-review` (when built).

Related TW: `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00`.

## Inputs (per loop under the batch / glob)

- Latest `review.md` / `review.N.md`
- `log.ndjson` (iterations, models, verify outcomes)
- `failure-domains.ndjson` (`review_gate`, `review_gate_hitl`, stagnation, …)
- Diff stats vs defaultBranch (or stored snapshots)

## Job

Find **cross-loop** problems the per-loop gate cannot see:

- Dead / half-finished abstractions repeated across loops
- Migration drift (A landed, B/C still on old shape)
- Correlated false-blocker patterns (same family reviewing own work)
- Failure-domain clusters worth a HITL or a new verify skill

## Passes (skill-derived, truncated)

1. **Risk of the aggregate** — highest blast radius across the set.
2. **Agent-as-reviewer (2b)** — do not trust a single loop's `review.md` alone;
   look for same-family bias and missing cross-module claims.
3. **Pincer Lite/Standard (2c)** — only on shared symbols that appear in ≥2 loops;
   Full isolation only if HIGH + wide fan-in.
4. **Structure (Pass 3)** — code judo across the set; deleteable layers.

Skip Full Roma harness and chat-length thermo by default.

## Output

Same markdown shape as loop reviews, plus:

```markdown
### Cross-loop themes
- …

### HITL follow-ups
- exact `task add project:<p> -- '…'` lines (UUID after create)

### Do not
- Mark individual loops complete / incomplete
- Re-run implement workers
```

Blockers still use the impact-severity contract (`templates/REVIEWS.md`).

## Non-goals

- Replacing `verify`
- Running the full unified-code-review skill on every loop
- Auto-merging

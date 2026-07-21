---
tags:
  - documentation
  - reviews
---
# REVIEWS.md — agent-loop

## Bar

- Prefer code judo: smaller surface, clearer names, fewer layers.
- Verifier (`verify` / `finalVerify`) is the hard gate; review is residual judgment.

## Blocker contract (impact-severity)

Every `### Blockers` bullet must start with:

```text
severity: error|warning impact: <tag>
```

**Gating impacts** (use `severity: error` only when real):

- `data-loss`
- `security-boundary`
- `false-closure`
- `cross-dispatch`
- `verify-bypass`

Default cosmetic / style / nits → `severity: warning impact: none`.

## Reproduce-before-report (when `reviewReproduce` is on)

Error+impact blockers must cite a path in the merge-base…HEAD diff, preferably `file:line`.
Findings without a citeable path, or citing paths outside the loop diff, are downgraded
and must not keep `reviewGate` open.

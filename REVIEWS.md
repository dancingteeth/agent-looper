---
tags:
  - documentation
  - reviews
---
# REVIEWS.md — agent-loop

Portable overlay for this dogfood repo. Keep short — inlined into quality-review prompts.

For full human/Cursor review (pincer Full, deep thermo), use the **unified-code-review**
skill outside the loop. Do **not** paste that skill into gate prompts.

Canonical template: `templates/REVIEWS.md`. Meta-review brief: `docs/meta-review-prompt.md`.

## Rubric wins (stop at first hit)

1. This `REVIEWS.md`
2. `AGENTS.md`
3. Harness defaults (risk preamble + verdict format)

## Process order

1. **Risk** — blast radius, not diff size
2. **Agent-authored** (loop-written code) — GOAL + verify are intent; test hunks first
3. **Operational laws** — Taskwarrior UUID below
4. **Structure** — code judo
5. **Verdict** — PASS | ADVISORY | BLOCKERS

Verifier is the hard gate; review is residual.

## Call-edge Lite

Shared helper / multi-caller change → open callee once; assumption mismatch →
gating blocker with `file:line`. No Full pincer in loop reviews.

## Blocker contract (impact-severity)

```text
- severity: error|warning impact: <tag> [must-fix] **Title** — detail
```

**Gating impacts:** `data-loss` | `security-boundary` | `false-closure` | `cross-dispatch` | `verify-bypass`

Default nits → `severity: warning impact: none`.

## Reproduce-before-report (when `reviewReproduce` is on)

Error+impact blockers need a citeable path in the merge-base…**working tree**
changed set (committed + staged + unstaged; prefer `file:line`).
Missing / out-of-diff citations are downgraded and must not keep `reviewGate` open.
If the changed-files set is empty, the filter is skipped (blockers stay gating).

## Task traceability

- Cite Taskwarrior **UUID** in GOAL / `taskwarriorUuid` / commits — never numeric ID alone.
- Gaps without UUID on non-trivial agent work → **ADVISORY** unless elevated here.

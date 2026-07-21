---
tags:
  - documentation
  - reviews
  - template
---
# REVIEWS.md

Portable review overlay for agent-loop consumers. Keep this file **short** — the
harness inlines it into every quality-review prompt.

For a full human/Cursor review (pincer Full, deep thermo), use the
**unified-code-review** skill outside the loop. Do **not** paste that skill here.

## Rubric wins (stop at first hit)

1. This `REVIEWS.md`
2. `AGENTS.md` / `.cursor/rules/*`
3. Harness defaults (risk preamble + verdict format in the prompt)

## Process order (every gated review)

1. **Risk** — blast radius, not diff size (HIGH / MEDIUM / LOW)
2. **Agent-authored** (when the change was loop/agent-written) — see below
3. **Operational laws** — only if this file or `AGENTS.md` defines them (skip if not)
4. **Structure** — code judo; no unearned layers
5. **Verdict** — PASS | ADVISORY | BLOCKERS

Verifier (`verify` / `finalVerify`) is the **hard gate**. Review is residual judgment.

## Agent-authored changes

- Intent evidence = frozen `GOAL.md` + verifier output — not the agent's "done" message.
- Read **test hunks first**; green CI ≠ correct until assertions are justified.
- Do not weaken tests, skip CI, or disable lint to go green.

## Call-edge Lite (shared helpers only)

When the diff touches a shared helper, middleware, or multi-caller path:

- Open the **callee once**; confirm throw vs null vs early-return.
- If caller assumptions disagree with callee reality → gating blocker with `file:line`.

Skip Full multi-pass pincer in loop reviews. Reserve that for chat / meta-review.

## Blocker contract (impact-severity)

Every `### Blockers` bullet:

```text
- severity: error|warning impact: <tag> [must-fix] **Title** — detail
```

**Gating impacts** (`severity: error` only when real):

- `data-loss`
- `security-boundary`
- `false-closure`
- `cross-dispatch`
- `verify-bypass`

Default cosmetic / style / nits → `severity: warning impact: none`.

## Reproduce-before-report (when `reviewReproduce` is on)

Error+impact blockers must cite a path in the merge-base…**working tree** changed
set (committed since merge-base **plus** staged/unstaged), preferably
`path/to/file.ts:123`. Missing or out-of-diff citations are downgraded and must
not keep `reviewGate` open. Empty changed-files set → filter skipped (keep gating).

## Task traceability (optional overlay)

When this repo uses Taskwarrior (or similar):

- Cite **UUID** in GOAL / commits / review — never numeric ID alone.
- Default tier: **ADVISORY** unless you elevate gaps to blockers below.

## Project-specific laws

<!-- Add cross-module invariants, file-size limits, deploy gates here. -->

- Prefer smaller surface, clearer names, fewer layers (code judo).

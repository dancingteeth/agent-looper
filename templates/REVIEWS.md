---
tags:
  - documentation
  - reviews
  - template
  - agentic_ai
  - agents
  - loops
---
# REVIEWS.md

Portable review overlay for Agent Looper consumers. Keep this file **short** — the
harness inlines it into every quality-review prompt.

**Specs ≠ prompts:** `AGENTS.md` steers the *worker* at runtime. This file is the
*judge* standard (what good residual conduct looks like after verify). Do not paste
worker instructions here, and do not load this file into the worker prompt.

For a full human/Cursor review (Pass 0…3, pincer Full, deep thermo), use the
**unified-code-review** skill (≥1.4.x) outside the loop. Do **not** paste that
skill here. Cross-loop residual: `docs/meta-review-prompt.md` (when shipped).

**Sensor contract:** verdict tokens `PASS` | `ADVISORY` | `BLOCKERS`. Omit empty
`### Blockers` / `### Advisory` / `### Nits`. Non-empty `### Blockers` ⇒ verdict
**must** be `BLOCKERS`. The harness treats gating (`error` + impact) bullets as
`BLOCKERS` even if a quoted heading says `PASS`. Guide / HITL / autofix act on
**gating** blockers; Advisory and Nits are for humans unless the user explicitly
asks otherwise.

## Rubric wins (stop at first hit)

1. This `REVIEWS.md`
2. `AGENTS.md` / `.cursor/rules/*`
3. Harness defaults (risk preamble + verdict format in the prompt)

## Process order (every gated review)

Compressed from UCR — keep Lite; no Full pincer in the gate:

0. **Change set** — review the loop’s working-tree / verify evidence; do not invent
   missing files; lockfiles / generated / scaffold prose gaps → Nit or omit
1. **Risk** — blast radius, not diff size (HIGH / MEDIUM / LOW); repo tiers below
   override portable defaults when present
2. **Agent-authored** (when the change was loop/agent-written) — see below
2b. **Always** — before a gating blocker, open the cited callee once (throw vs null
   vs early-return); `[must-fix]` needs a live production path, else Advisory
   `[latent_contract]`
2c. **Call-edge Lite** — shared helpers / multi-caller only (below)
3. **Operational laws** — only if this file or `AGENTS.md` defines them (skip if not)
4. **Structure** — code judo; no unearned layers
5. **Verdict** — PASS | ADVISORY | BLOCKERS

Verifier (`verify` / `finalVerify`) is the **hard gate**. Review is residual judgment.
Do **not** treat this judge as a security sandbox — egress, secrets, and install
policy belong in shell verify / `PERMISSIONS.md` / the host runtime (model ≠
control plane).

## Agent-authored changes

- Intent evidence = frozen `GOAL.md` + verifier output — not the agent's "done" message.
  Cite the capture; do not invent a diagnosis stdout/stderr do not state.
- Read **test hunks first**; green CI ≠ correct until assertions are justified.
- Do not weaken tests, skip CI, or disable lint to go green.
- Unbacked “tested / done” claims without verify/log evidence → Advisory
  `[unverified_claim]` (elevate to gating blocker only on HIGH + open risk questions).

## Call-edge Lite (shared helpers only — §2c Lite)

When the diff touches a shared helper, middleware, or multi-caller path:

- Open the **callee once**; confirm throw vs null vs early-return.
- If caller assumptions disagree with callee reality → gating blocker with `file:line`.

Skip Full multi-pass pincer in loop reviews. Reserve Full / Standard depth for
chat (UCR skill) or cross-loop meta-review.

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

## Intervention modes (Proceed / Guide / Deny / Confirm)

Strands-aligned vocabulary for how review interacts with the loop. Verifier remains
the hard gate; these modes describe *review residual judgment* only.

| Mode | Agent Looper meaning |
| --- | --- |
| **Proceed** | PASS / ADVISORY, or BLOCKERS with only warning/`none` impact — loop completes |
| **Guide** | `reviewGate` continue — worker gets **Guide packets** (reason + required change) |
| **Deny** | `severity: error` + recognized impact tag — keeps the gate open (blocks Proceed) |
| **Confirm** | `reviewGateHitl` / HITL task — human closure; result `status: waiting` |

Do not invent a fifth mode. Shell `verify` exit `0` is never replaced by Proceed.
Proceed / Guide / Deny are quality residual modes — not network, secret, or RCE controls.

## Loop risk inference

Optional overlay for `postQualityReview: "auto"`. Keywords match `GOAL.md` + `verify`
(word boundaries). Merge order: harness defaults → this section →
`agent-loop.repo.json` `loopRiskProfile` → per-loop `loopRiskProfile` in `loop.json`.

### HIGH
auth, payment, PII, production database, deploy, secrets

### MEDIUM
checkout, integrations, business logic, webhooks

### LOW
docs, formatting, internal tooling, test-only refactors

Set `reviewRisk` in `loop.json` to `high` | `medium` | `low` to skip inference.

Repo-level keyword merge: optional `loopRiskProfile` in `.cursor/agent-loop.repo.json`
(see `templates/agent-loop.repo.json.example`).

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

Keep this section **sparse** — elevate only durable, high-impact conduct you will
actually gate on. Prefer fewer laws over a novel. When a law stops failing under
the current worker/judge models, **delete it** (same instinct as prompt diet).
When a worker mistake repeats across runs, add a computational check in
`verify.sh` (or a linter) rather than a new law here.

When authoring a new law (or a new gating impact), if the standard feels mushy,
sketch it with these dimensions (Agent Behavior-inspired; free-form is fine):

| Dimension | Ask |
| --- | --- |
| **Intent** | Why it matters and when it applies |
| **Evidence** | What the agent should inspect or verify before deciding |
| **Decision** | What it should conclude from that evidence |
| **Execution** | What it should do after deciding |
| **Recovery** | What to do when evidence is incomplete or the first path fails |
| **Failure modes** | Undesired conduct this law prevents |

Then emit findings with the blocker contract above (`severity` + `impact`). Laws
that do not apply to *this* diff → treat as **NA** (omit / advisory), do not force
a gating blocker.

- Prefer smaller surface, clearer names, fewer layers (code judo).

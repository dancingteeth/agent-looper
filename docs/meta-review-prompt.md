---
tags:
  - documentation
  - loops
  - roadmap
---
# Meta-review prompt outline (M5)

Cross-loop residual review — **not** a per-loop gate. Does not flip loop
`complete` flags. Process source: [unified-code-review](https://github.com/dancingteeth/unified-code-review)
**≥1.4.x** (Pass 0…3 + §2b/§2c). This file is the **compressed judge brief** for
`agent-loop-meta-review` — do **not** paste the full skill.

Related TW: `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00`.

**Sensor, not merge.** Verdict tokens (byte-identical): `PASS` | `ADVISORY` | `BLOCKERS`.
Omit empty `### Blockers` / `### Advisory` / `### Nits` sections; never emit placeholders.
Pipeline contract: HITL / follow-up action comes from **Blockers** (and explicit HITL
bullets) — Advisory/Nits are for humans.

## Inputs (per loop — this is Pass 0)

Treat the collected artifacts as the change set (not a PR merge-base diff):

- Latest `review.md` / `review.N.md` **or** `.cursor/loop-exports/<slug>/review.md`
- `log.ndjson` **or** export `log-tail.ndjson`
- `failure-domains.ndjson` (in-loop or export pack)
- Diff stats vs `defaultBranch` (or stored snapshots)
- Note missing artifacts; do not invent file contents
- **Do not** treat missing gitignored in-loop files alone as “never ran” when an export pack or PR exists

Out of scope for findings unless they encode a **code** invariant: lockfiles,
generated output, scaffold/`GOAL.md` prose gaps → omit or Nit, never Advisory/Blocker.

## Job

Find **cross-loop** problems the per-loop gate cannot see:

- Dead / half-finished abstractions repeated across loops
- Migration drift (A landed, B/C still on old shape)
- Correlated false-blocker patterns (same family reviewing own work)
- Failure-domain clusters worth a HITL or a new verify skill
- Unbacked “green / done” claims across loops → `[unverified_claim]` when
  logs/verify evidence do not support the per-loop review narrative

## Passes (UCR-derived, truncated)

0. **Change set** — which loops are in scope; what artifacts are present/missing;
   highest shared blast radius across the set.
1. **Risk of the aggregate** — blast radius, not total LOC; answer what could go
   wrong across the set; use each repo’s `REVIEWS.md` risk tiers when present.
1b. **Operational laws** — only if a repo overlay defines task/deploy/issue laws
   (e.g. Taskwarrior UUID). Else skip.
2. **Agent-authored lens** — these loops are agent work: prefer intent from
   `GOAL.md` + verify/log evidence over polished `review.md` prose; distrust
   repeated first-touch rubber stamps (`[unverified_claim]`).
2b. **Agent-as-reviewer (always)** — do not trust a single loop’s `review.md`
   alone; look for same-family bias; before `BLOCKERS`, trace one level deeper
   on the cited symbol; live-path gate — `[must-fix]` needs a real production
   path across the set, else Advisory `[latent_contract]`.
2c. **Pincer** — only on shared symbols / wiring that appear in **≥2 loops**;
   default **Lite**, **Standard** when MEDIUM/HIGH shared helpers; **Full** only
   if HIGH **and** wide fan-in (and Full harness is available — otherwise run
   Standard and mark Full unverified). Never Skip on HIGH shared wiring.
3. **Structure** — code judo across the set; deleteable layers / duplicated
   half-abstractions.

Skip chat-length thermo and Full Roma isolation by default.

## Output

Same markdown shape as loop reviews, plus:

```markdown
### Risk
…

### Verdict
PASS | ADVISORY | BLOCKERS

### Cross-loop themes
- …

### HITL follow-ups
- exact `task add project:<p> -- '…'` lines when human closure is needed
  (opaque checkpoint id after create; not always a UUID)

### Do not
- Mark individual loops complete / incomplete
- Re-run implement workers
- Claim Full pincer coverage you did not run
```

Blockers still use the impact-severity contract (`templates/REVIEWS.md`).
Non-empty `### Blockers` ⇒ verdict **must** be `BLOCKERS`.

## Non-goals

- Replacing `verify`
- Running the full unified-code-review skill on every loop
- Auto-merging
- Inlining `FULL-PINCER.md` / `SOURCES.md` into this brief

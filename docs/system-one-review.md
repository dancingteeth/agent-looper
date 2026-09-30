---
tags:
  - documentation
  - loops
  - review
  - agentic_ai
---
# System One / Jev — typed review layer (proposed)

Optional **third review layer** beside the hard verifier and the generative judge.
It does **not** replace `verify`, `reviewRuntime`, or `agent-loop-prompt` scaffold
authorship.

**Product decision (locked):** Jev / TypeSafe System One is **not** a
`reviewRuntime` or chat judge slug. It does not emit `review.md` prose, PASS/
ADVISORY/BLOCKERS headings, or GOAL/verify scaffold text. It returns **typed**
answers (`noul` / `choice` / `score`) plus probabilities via the OpenRouter
**System One** decisions API.

Design context: [`loop-review-patterns.md`](./loop-review-patterns.md) (pattern 9),
build plan: [`loop-review-roadmap.md`](./loop-review-roadmap.md) (M11).

## Stack position

```text
verify (shell) — hard gate, unchanged
  → generative primary review (reviewRuntime + reviewModel) — review.md prose
  → optional reviewReproduce / reviewSecondaryRuntime — still generative
  → optional systemOne — one decisions call over fenced state
  → human (reviewGateHitl / HITL) — closure authority unchanged
```

- Runs only **after** verify is green (`verify` / `finalVerify` exit `0`).
- May run **in parallel with** or **after** generative review; harness should not
  block generative review on System One when both are enabled.
- `reviewGate` behavior for prose blockers stays as shipped (impact-severity,
  secondary merge, reproduce filters). System One adds a **separate** gate mode
  via `systemOne.gate`.

**Contrast with `reviewSecondaryRuntime` (M3, shipped):** secondary is still a
full agent session that **writes** `review.md` and merges gating blockers.
System One never authors markdown; it only answers a fixed question schema.

## OpenRouter models (public)

| Pin | OpenRouter model id |
| --- | --- |
| Pinned release | `typesafe/jev-1.13` |
| Rolling alias | `~typesafe/jev-latest` |

Endpoint shape (TypeSafe-compatible **decisions**, not chat completions):

```http
POST https://openrouter.ai/api/alpha/decisions
```

Body (conceptual):

```json
{
  "model": "typesafe/jev-1.13",
  "state": "<fenced bundle: GOAL excerpt, diff summary, REVIEWS.md, optional review.md>",
  "questions": [ … ]
}
```

Do not route Jev through OpenCode Go chat slugs or `reviewModel` strings meant
for Cursor/Cline/OpenCode SDK sessions.

**Pricing:** OpenRouter’s public page lists on the order of ~$0.042/M input;
per-decision calls are cheap relative to a full generative judge pass. Catalog
rows in `src/loop/modelCatalog.generated.ts` / `modelPricing.generated.ts` may
lag — a follow-up sync PR is separate from this feature.

**Auth:** reuse the same BYOK path as OpenRouter-backed workers (`OPENROUTER_API_KEY`;
see [`opencode-providers.md`](./opencode-providers.md)). Never document or paste
keys in loop bundles.

## `loop.json` sketch (proposed)

```json
{
  "reviewGate": true,
  "reviewRuntime": "cursor",
  "reviewModel": "grok-4.6-high",
  "systemOne": {
    "enabled": true,
    "provider": "openrouter",
    "model": "typesafe/jev-1.13",
    "gate": "advisory"
  }
}
```

| Field | Meaning |
| --- | --- |
| `enabled` | Master switch (default off). |
| `provider` | Start with `openrouter` only. |
| `model` | `typesafe/jev-1.13` or `~typesafe/jev-latest`. |
| `gate` | How typed answers affect the grind (below). |

### `systemOne.gate`

| Value | On API / parse failure | On typed “fail” signals |
| --- | --- | --- |
| `off` | N/A (disabled) | N/A |
| `advisory` | **Fail open** — log + surface in `run-report.md`; do not reopen worker | Surface scores / choices; do not reopen on noul=false alone unless harness adds explicit thresholds later |
| `block` | **Fail closed** — treat like an unrecoverable review gate error (same family as `reviewGate` stuck) | Reopen fix loop when configured thresholds trip (e.g. `does_pass` false with high confidence, or `residual_quality` below floor) |

Threshold details belong in harness config + tests when implemented; this doc
fixes the semantics: **block** means typed layer can keep the gate open;
**advisory** never substitutes for missing generative review when `reviewGate`
expects `review.md`.

## Question schema (harness-owned)

Questions are **not** free-form prompts. They map from residual rubric /
`templates/REVIEWS.md` defaults so runs are comparable across loops:

| Kind | Example id | Role |
| --- | --- | --- |
| `noul` | `does_pass` | Binary residual accept after verify |
| `score` | `residual_quality` | Calibrated 0–1 style residual strength |
| `choice` | `blocker_class` | Bucket for failure domain (`verify-bypass`, `false-closure`, …) |

One decisions call per review cycle (after green verify), evaluating all
questions against the same fenced `state` blob (goal excerpt, diff stats, REVIEWS
overlay, optional truncated `review.md`).

LangChain’s public Jev-as-judge experiments motivate **consistency and cost** for
repeatable rubrics; Agent Looper still treats **shell verify** as the only hard
“done” sensor and keeps generative review for prose, Guide packets, and HITL.

## Non-goals

- Not in `costPreset` **minmax** (minmax stays Hy3/Composer worker + Grok generative judge).
- Not `agent-loop-prompt` author for GOAL.md / `verify.sh`.
- Not a `reviewRuntime` / `reviewModel` chat slug.
- Not a replacement for impact-severity parsing or secondary generative merge.
- Not auto-enabled on trivial smokes (`reviewGate: false` loops stay unchanged).

## Related shipped behavior

- Primary + secondary judges: generative only — [`README.md`](../README.md) review gate flow.
- With `reviewGate: true`, secondary judge **runs** even on primary PASS (no gating bullets); with `reviewGate: false`, secondary skips on clean PASS.
- Intervention modes (Proceed / Guide / Deny / Confirm) apply to **generative** residual judgment only; System One is an additional sensor, not a fifth mode.

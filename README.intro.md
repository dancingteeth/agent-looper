---
tags:
  - documentation
  - getting-started
  - agents
  - loops
---
# agent-loop — a loop harness that actually finishes the job

**Fix-until-green for Cursor (and Cline):** one frozen goal, a cheap worker that edits the repo, a shell check that decides “done,” optional smarter review that can send the worker back — until the check is green or you stop it.

If you’ve heard “stop prompting, start looping” and you’re hunting GitHub for a non-theater implementation — this is that: **small, measurable, opt-in complexity**, default path is Cursor-only and relatively cheap.

> Full reference (every flag, threat model, consumer wiring): [`README.md`](./README.md)  
> Deep dive: [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## Why this exists

A single chat agent will often:

1. Edit a few files  
2. Say “done”  
3. Leave tests red  

You are still the loop — you re-prompt, paste failures, hope.

**agent-loop** makes the computer own that cycle:

```text
GOAL (frozen) → WORKER edits code → VERIFY (shell exit 0?) → if fail, new fresh worker with the failure → repeat
```

Optional after green verify: a **judge** reviews quality. With `reviewGate`, only serious findings reopen the fix loop. Cosmetic nits don’t thrash forever.

That’s the product. Everything else is cost control and false-positive control around that spine.

---

## How one iteration works

```mermaid
flowchart LR
  G[GOAL.md + loop.json] --> W[Worker agent<br/>fresh context]
  W --> V{verify<br/>exit 0?}
  V -->|no| L[log.ndjson + failure text]
  L --> W
  V -->|yes| R{reviewGate?}
  R -->|off / ADVISORY| D[Done]
  R -->|gating blockers| W
```

| Role | Who | Job |
| --- | --- | --- |
| **Worker** | Coding agent (Cursor or Cline SDK) | Implement / fix toward `GOAL.md`. **New session every iteration** — progress lives in git + files, not chat memory. |
| **Verifier** | Your shell command (`verify.sh`) | The only thing that can say “complete.” Exit `0` = green. Not vibes. |
| **Judge** | Separate Cursor review model (optional) | After verify passes, write `review.md`. With `reviewGate`, only **error + impact** findings reopen the worker. |
| **You** | Human | Write the goal and the verify script. Escalate when the gate is stuck (`reviewGateHitl` / Taskwarrior). |

**Important:** “Risk: HIGH” in a review ≠ failed loop. Risk is blast radius of the *change*. Completion is verify + (optional) gating blockers.

---

## Worker vs judge by runtime

Review always goes through the **Cursor SDK** judge path (Composer or Grok). The **worker** is either Cursor or Cline.

| `runtime` | Worker (implement) | Judge (quality / review-gate) | When to use |
| --- | --- | --- | --- |
| **`cursor`** (default) | **Composer 2.5** | **Grok 4.5** (override with `reviewModel`) | Cursor-only dogfood; no `@cline/sdk` required |
| **`cline-pass`** | Cline SDK · **ClinePass** · default `cline-pass/deepseek-v4-flash` (escalate → `qwen3.7-plus`) | Cursor **Composer 2.5** unless you set `reviewModel` | Subscription quota; cheap implement loops |
| **`cline`** | Cline SDK · **Credits** · default `deepseek/deepseek-chat` (escalate → `gemini-2.5-pro`) | Same as above | Pass quota exhausted; pay-as-you-go |

Same package: **Cline SDK** (`@cline/sdk`) with two billing modes — ClinePass vs Credits — not two different products.

Never use Composer **Fast** as the judge. Worker on Cursor is always Composer 2.5 (not Fast).

---

## Why it’s built this way (not a multi-agent circus)

| Choice | Why |
| --- | --- |
| **Fresh context each iteration** | Long chats fill with failed tool junk → doom loops. Files + `log.ndjson` are the memory. |
| **Shell verify is hard gate** | Models approve their own work. Exit codes don’t. |
| **Cheap worker, stronger judge** | Most tokens are “edit until green.” Spend on Composer/DeepSeek for that; use Grok (or secondary Cline) when verify already passed. |
| **Impact-severity gating** | Stops “docs tone” findings from burning another $0.50 iteration. |
| **Reproduce filters (opt-in)** | Drops confabulated blockers that don’t cite real changed paths / evidence. |
| **Secondary Cline judge (opt-in)** | Same-family under-flagging insurance — off by default so Cursor-only stays simple. |
| **Monolithic loop** | One repo, one process, one `GOAL.md`. Batches and meta-review are separate tools, not a mesh inside every run. |

If a README promises “autonomous digital employees,” walk away. This one promises: **green verify, bounded spend, inspectable logs.**

---

## 60-second install (Cursor-only)

```bash
pnpm add -D @dancingteeth/agent-loop @cursor/sdk
# or link a sibling checkout — see README.md

export CURSOR_API_KEY=…   # or: doppler run -- …

agent-loop-init
# edit .cursor/loops/my-task/GOAL.md
# edit verify.sh until `bash .cursor/loops/my-task/verify.sh` is honest

agent-loop run .cursor/loops/my-task --runtime cursor --review-gate
```

Need Cline? Add `@cline/sdk`, set `CLINE_API_KEY`, use `--runtime cline-pass` or `cline`.

---

## Minimal `loop.json` that makes sense

```json
{
  "runtime": "cursor",
  "model": "composer-2.5",
  "reviewModel": "grok-4.5",
  "maxIterations": 6,
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "postQualityReview": "auto",
  "reviewGate": true,
  "notifyTelegram": false
}
```

`postQualityReview: "auto"` (the default) runs the judge only when inferred risk is **not low** — docs/harness-only loops skip review and save judge tokens. Set `"postQualityReview": true` when you always want `review.md`.

Preview before a run:

```bash
agent-loop-review-preview .cursor/loops/my-task
# Risk: MEDIUM | Auto: would run review.md after success
```

Tune inference in `REVIEWS.md` (`## Loop risk inference`), `.cursor/agent-loop.repo.json` (`loopRiskProfile`), or per-loop `loopRiskProfile` / `reviewRisk` in `loop.json`. See [`README.md`](./README.md#loopjson--review--quality).

Bundle layout:

```text
.cursor/loops/my-task/
  GOAL.md           # frozen spec — don’t edit mid-loop
  loop.json         # runtime + verify + gates
  verify.sh         # measurable checks (exit 0)
  VERIFY.skill.md   # how the worker should think about verify (optional)
  log.ndjson        # what happened (runtime artifact)
  review.md         # judge output (when review runs)
```

Write `verify.sh` like a skeptic: typecheck, focused tests, one smoke command. If you can’t measure it, the loop will thrash on prose.

---

## Cost & speed (honest)

- **Fast path:** Cursor worker + tight `verify.sh` + `reviewGate` only when the change can actually hurt (auth, data, gate bypass). Use `postQualityReview: "auto"` so docs-only loops skip the judge.  
- **Cheap path:** ClinePass DeepSeek Flash as worker; escalate model only after stagnation.  
- **Don’t:** leave `reviewReproduceAgent` + secondary Cline + full suite verify all on for a docs typo.  
- Stderr prints token / ~$ estimates when the run finishes. Treat them as guidance, not invoices.

---

## What else is in the box (later, not day one)

Once the basic loop is boringly reliable:

| Feature | One line |
| --- | --- |
| `postQualityReview: "auto"` + `REVIEWS.md` risk keywords | Skip judge on low-risk loops; domain keywords in `## Loop risk inference` |
| `reviewReproduce` / `reviewReproduceAgent` | Kill false blockers before they reopen the gate |
| `reviewSecondaryRuntime` | Second-family judge via Cline SDK |
| `verifyMode: skill` | Agent runs `VERIFY.skill.md`, then shell still wins |
| `agent-loop-batch` / meta-loop | Probe → fix → re-probe |
| `agent-loop-meta-review` | Read-only report across N finished loops |
| `--trust-config` / `trustConfig` | Ack reviewed shell commands; optional strict gate |
| Telegram + Taskwarrior UUID | Completion pings; auto-`task done` |

Reference (flags, CLIs, threat model): [`README.md`](./README.md).

---

## Trust model (one paragraph)

`verify` / `finalVerify` / `syncCommand` run with `shell: true` in **your** repo. Only run this on checkouts you trust. Review those commands before the first run; pass `--trust-config` (or set `trustConfig: true` in `loop.json`) after review. Strict CI can set `AGENT_LOOP_REQUIRE_TRUST_CONFIG=1`.

---

## License

MIT · [@dancingteeth/agent-loop](https://github.com/dancingteeth/agent-loop)

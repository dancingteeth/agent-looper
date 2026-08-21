---
tags:
  - documentation
  - runtimes
  - cost
  - agents
  - loops
---
# Same-task runtime cost bench

Measure **cheap worker vs expensive worker** on a *frozen* loop. Shell `verify`
stays the exit. The judge is residual quality, never the scoreboard.

Steal: TrueForge / Nouri **method** (same task, same tools, change one variable).
Not Enterprise-Bench, not MCP CRM tasks, not a new dogfood loop in this repo yet.

**Numbers are not in this doc yet.** Run the protocol later (live worker spend).
Do not invent rows.

## Use case

You already pick workers by story: Cursor for dogfood, Pi/OpenCode to keep
implement tokens off Cursor quota, escalate only on stagnation. That story is
unmeasured. The bench is how you find out whether it is true **on a loop you
actually run**.

**When:** before making a runtime the default for a class of work, after a model
bump, or when someone claims “X is cheaper” and you want the same method on
*this* harness — not TrueForge’s CRM tasks.

## Protocol

1. Freeze one bundle (`GOAL.md` + `verify.sh` + `loop.json`). Do not edit the
   finish line between runs.
2. Run **n ≥ 3** trials per configuration (fresh `agent-loop run` each time).
3. Change **one** variable: `runtime`, or `model`, or `reviewRuntime`. Leave
   verify, GOAL, and permissions identical.
4. Record from `run-report.md` (and `log.ndjson` if you need token detail):

   | Field | Why |
   | --- | --- |
   | complete / iterations | Did it finish, and how many outer loops? |
   | tokens / $ if present | Loop cost, not just the last answer (`formatUsageSummaryLine`) |
   | stagnation / review-gate cycles | Hidden spend |

5. Compare means. A configuration that fails verify is **not** cheaper.

Replay a historical run the same way: keep the bundle, swap one field, compare
the new `run-report.md` to the old one. `log.ndjson` is the replay surface —
do not build a second event log.

## Suggested first slice (deferred)

Reuse an existing tiny smoke loop rather than inventing a new GOAL:

- `.cursor/loops/pi-smoke` (`runtime: pi`)
- `.cursor/loops/opencode-smoke` (`runtime: opencode`)
- same verify, swap **one** field to `runtime: cursor` (copy the smoke bundle
  or change only `loop.json` between trial sets)

Keep `postQualityReview` / `reviewGate` **off** for this slice so review-gate
unparseable verdicts do not mask implement cost. Record iterations-to-green and
the `Usage:` line from `run-report.md`.

Do **not** include `runtime: dsh` in the first token/$ slice. Headless DSH does
not yet return usage into `loopUsage` (`usage: (no token data captured)` on
`cli-setup-wizard`). Iterations-to-green for DSH can wait until usage is wired,
or be logged as complete/iterations only.

## Results

| Config | n | complete | mean iterations | tokens / $ | notes |
| --- | --- | --- | --- | --- | --- |
| *(not run)* | | | | | fill after n≥3 |

## Out of scope

- LLM-as-exit or “which answer looks better”
- Nesting another harness as `runtime`
- Publishing numbers until n≥3 actually ran
- Faking usage for DSH / missing provider telemetry

Related: [`runtime-map.md`](./runtime-map.md), [`competitive-steal-backlog.md`](./competitive-steal-backlog.md) P6.

---
tags:
  - documentation
  - agents
  - loops
---
# cli-max-cost — dollar cap as a first-class stop

## Finish line (four parts)

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal | Loop pauses itself when spend crosses `maxCostUsd` and asks a human |
| **Scoreboard** | `verify.sh` | Schema + agentLoop unit tests with injected usage (no live paid run) |
| **Permission** | `loop.json` | `maxIterations` 8 / `stagnationThreshold` 3 |
| **Budget** | below | Stop when verify is green. This loop *implements* budget; do not polish Watch |

## Goal

GOAL templates already call **budget** a finish-line part; the harness only enforces `maxIterations`. Add a user-set dollar cap.

1. `maxCostUsd` on `loop.json` (optional number, `> 0`). CLI `--max-cost <n>` overrides.
2. After each implement (and review, if billed) usage record is added, if `totalCostUsd >= maxCostUsd`, **stop**. Do not start the next worker iteration.
3. Result: `complete: false`, `status: waiting`, completionReason names the cap and the totals (`totalCostUsd`, `maxCostUsd`, `costSource` mix). Add HITL reason **`budget`** to `hitlCheckpointReasonSchema` (exhaustive switch — handle the new variant everywhere the union is switched).
4. Create a HITL checkpoint when a provider is configured (same path as other waiting states). Telegram uses the existing completion report (sibling loop may add resume text; this loop must still send failure notify if Telegram is on).
5. Status line / logs must distinguish **provider** vs **estimated** cost. If all records are estimated, the reason must say `estimated` so humans do not treat `$0` OpenCode/Codex rows as a hard ledger.

Default: field omitted = no dollar cap (today’s behavior).

## Budget

- Stop when verify is green.
- Do not build Linear-style credit billing or pause-at-zero platform UX.

## Acceptance criteria

Success is **only** `verify.sh` exit 0.

1. `loopConfigSchema` accepts `maxCostUsd` and rejects `0` / negative. Omitted stays undefined.
2. `parseRunArgs` accepts `--max-cost 10` and rejects non-numeric.
3. `runAgentLoop` test: mock usage so iteration 1 records `costUsd` that crosses the cap; loop stops with `status === 'waiting'`, `complete === false`, HITL `budget` invoked, iteration 2 worker **not** started.
4. `runAgentLoop` test: cap omitted, same usage, loop continues (existing complete-on-verify behavior).
5. README `loop.json` table documents `maxCostUsd` (one row). No new markdown essays.

## Constraints

- Paths: `src/loop/loopConfig.ts`, `src/cli/runArgs.ts`, `src/loop/agentLoop.ts`, `src/integrations/hitlConfig.ts` (+ HITL call sites), `src/usage/loopUsage.ts` if a helper helps, tests, `README.md` config table.
- Preserve `cli-watch` phase hooks if they already exist when this loop runs second — do not delete `onPhase`.
- Do not edit this `GOAL.md` / `loop.json` / `verify.sh` during the loop.

## Out of scope

- Watch TUI, fleet `ls`, setup wizard, changing default `maxIterations`.
- Accurate pricing for every BYOK model (label estimated; do not fake provider invoices).

## References

- `templates/GOAL.template.md` Budget row
- `docs/competitive-steal-backlog.md` Linear skip: credit / pause-at-zero (do not clone that product)
- `src/usage/loopUsage.ts` `costSource`

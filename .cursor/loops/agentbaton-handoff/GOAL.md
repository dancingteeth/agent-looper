---
tags:
  - documentation
  - agents
---

# agentbaton-handoff — capable → efficient handoff (arXiv:2610.35959)

Capable-first, hand off to efficient once readiness is detected. The harness
(not the worker) decides, via `detectHandoffReadiness()` in
`src/loop/loopHandoffReadiness.ts`.

## Goal

`loop.json` accepts `handoffModel` (+ `handoffMinIteration`, default 2).
Each iteration the harness checks readiness — workspace artifact present,
real product feedback observed (env failures don't count), remaining work
localized — and latches onto `handoffModel` for all remaining iterations.
Escalation (`escalateModel` on stagnation/fault) still applies on top.

Canonical modules: `src/loop/loopHandoffReadiness.ts`,
`src/loop/loopAgentEscalation.ts` (`resolveIterationAgent`),
`src/loop/loopConfig.ts`, `src/loop/agentLoop.ts`.

## Budget

- Stop when `verify.sh` is green.
- Do not touch `GOAL.md` mid-loop (harness restores it).

## Acceptance criteria

Success is determined **only** by the verifier in `loop.json`
(`verify.sh` exit `0`), not by your assessment.

1. `detectHandoffReadiness` returns ready with artifact + product failure +
   repeat signature, and not ready when clean, on env failure, when green,
   or before `minIteration`.
2. `resolveIterationAgent(config, i, …, handoffReady=true)` uses
   `handoffModel`; `false` stays on the capable model.
3. `loop.json` in this directory parses via `parseLoopConfig` with the
   `handoffModel` intact.

## Constraints

- Keep changes scoped to the handoff path.
- Do **not** edit `GOAL.md` during the loop.

## Out of scope

- Per-turn routing or query-level routing.
- New cost presets or judge changes.

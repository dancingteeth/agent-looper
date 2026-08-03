---
tags:
  - documentation
  - roadmap
  - competitive
  - agents
---
# Competitive steal backlog (Jul–Aug 2026)

Decisions from evaluating Strands, Cursor Router, Kilo Speed, Thariq/Claude Code,
Mastra Factory/Goals, AI Maker (Wyndo), [Linear Loops](https://linear.app/docs/loops),
and [Agent Behavior](https://agentbehavior.dev/) / Braintrust+Basis (Aug 2026).
Merge canvas: `session-steal-decisions` under the workspace canvases dir.

## Wedge (never trade)

| Axis | agent-loop | Do not adopt |
| --- | --- | --- |
| Exit | Shell `verify` exit `0` | LLM judge 1/0 as sole exit (Mastra Goals / Linear Loops) |
| State | Fresh context + git/files | Accumulating thread / summarizers (Strands); prior-run memory as spine (Linear) |
| Scope | One-repo fix harness | Issue→prod / team-ops factory UI (Mastra Factory / Linear Loops) |

## P0 — ship as docs/templates (M6)

| Item | Source | Deliverable |
| --- | --- | --- |
| Humans design loops | Mastra / Wyndo | `README.intro.md` positioning |
| Prompt diet on model bumps | Thariq (−80% CC prompt) | `AGENTS.md` working agreement |
| Unknowns preflight | Thariq | `docs/unknowns-preflight.md` |
| Metric-grind template | Kilo | `templates/GOAL.metric.template.md` + `verify.metric.example.sh` |
| Agent-readable docs | Strands | root `llms.txt` |

## P1 — next harness slice (M7)

| Item | Source | Notes |
| --- | --- | --- |
| Proceed / Guide / Deny / Confirm | Strands | **Shipped** — `templates/REVIEWS.md` + dogfood `REVIEWS.md` |
| Guide packets on re-entry | Strands | **Shipped** — `src/review/guidePackets.ts` → worker prompt |
| `done \| continue \| waiting` | Mastra | **Shipped** — `AgentLoopResult.status` + HITL `failure-domains` `status: waiting` |
| Hybrid dynamic verify | Kilo | **Shipped** — docs in `verification-as-skill.md` |
| Trivial-verify warning | Thariq | **Shipped** — `loadLoopBundle` + `agent-loop-doctor` warn |

## P2 — M8 (dogfood loops)

| Item | Source | Notes |
| --- | --- | --- |
| Batch-item rubrics | Thariq workflows | **Shipped** — `loops[]` string or `{ path, rubric }`; prompt `## Batch rubric`; see `templates/loop-batch.example.json` |
| Computer-use verify example | Kilo | **Shipped** — `templates/GOAL.computer-use.template.md` + `verify.computer-use.example.sh`; dogfood loop `.cursor/loops/computer-use-verify-example` UUID `c288e732-7755-40ca-a468-a4d29c5757f9`. Default loops stay headless; visible UI is opt-in via `RUN_UI=1`. |
| Cursor Auto / Router worker | Cursor Router | **Blocked** — see `docs/cursor-auto-router.md`. Default stays `composer-2.5` until SDK logs routed model id. Loop UUID `ad4aba56-9e56-45c3-b669-52fa23688474`. |

Batch runner: `.cursor/loops/m8-competitive/loop-batch.json` (uses per-item rubrics).

Per-item rubrics are **prompt-only** — shell `verify` remains the hard gate. See `templates/loop-batch.example.json`.

## P3 — M9 (Linear Loops steals)

Source: [Linear Loops docs](https://linear.app/docs/loops) + [launch post](https://linear.app/now/introducing-loops) (2026-07-20).
Linear’s product is team-ops automation (schedule / issue triggers, MCP tools, AI credits).
Steal the **governance UX**, not the exit model or issue-graph scope.

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Prove in chat → freeze | Docs / process | **Shipped** — `docs/unknowns-preflight.md` “Prove in chat → freeze” + `README.intro.md` pointer | Same instinct as Linear Agent chat → Create loop |
| Draft → Publish | Docs discipline | **Shipped (docs-only)** — draft-until-freeze language in unknowns preflight; no harness publish snapshot yet | Mid-loop GOAL edit already forbidden in `AGENTS.md` / GOAL templates |
| Run history as default audit surface | Harness + docs | **Shipped** — `run-report.md` + `agent-loop-export-run`; intro calls it the default audit surface | Linear: Run history is the post-run home |
| Permission / scope matrix | Template | **Shipped** — `templates/LOOP.permissions.example.md` | Docs for humans/judge; harness does not enforce every row |
| External / tool default-deny | Docs + template | **Shipped** — default-deny rows in permissions template + unknowns preflight / intro | MCP / extra tools opt-in per loop; name before freeze |

### Explicit skips (Linear)

- LLM judgment / “agent decides next best action” as sole exit
- Issue / Slack / schedule triggers as core harness (factories compose the harness)
- Prior-run memory as primary state
- Coding-session delegation without shell `verify`
- Credit / pause-at-zero billing model
- Personal OAuth identity for shared loop tool auth (wrong layer for local harness)

## P4 — Agent Behavior (Braintrust + Basis)

Source: [agentbehavior.dev](https://agentbehavior.dev/) + [Behavior specs blog](https://www.braintrust.dev/blog/behavior-specs) (2026-07-29).
Open Markdown format for durable *process* expectations (Intent / Evidence / Decision /
Execution / Recovery), aimed at trajectory judges — **not** runtime prompts.
`REVIEWS.md` already plays that role here; steal authoring discipline, not a parallel tree.

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Five-dimension authoring checklist | Docs / template | **Shipped** — `templates/REVIEWS.md` Project-specific laws | Use when a new law / impact tag feels mushy |
| Specs ≠ prompts | Docs | **Shipped** — `templates/REVIEWS.md`, `README.intro.md`, dogfood `REVIEWS.md` / `AGENTS.md` | `AGENTS.md` = worker; `REVIEWS.md` = judge |
| Sparse standing standards + retire when models hold | Docs | **Shipped** — prompt-diet extended in `AGENTS.md` + sparse note in template | Delete laws the worker stops failing |
| true / false / NA per law | Docs only | **Shipped** — NA language in `templates/REVIEWS.md` | Cousin of warning/`none` + reproduce filter |

**Better home for deeper steals:** [unified-code-review](https://github.com/dancingteeth/unified-code-review) (sensor for agent-authored process on diffs). Keep agent-loop thin.

### Explicit skips (Agent Behavior)

- `.agents/behaviors/**/BEHAVIOR.md` layout (dual source of truth with `REVIEWS.md`)
- Braintrust discover/judge tooling / production-traffic standing evals
- Replacing impact-severity tags with free-form behavior files
- Loading behavior specs into the *worker* prompt (violates prompt diet; their own rule says never show the agent)

## Explicit skips (earlier)

- OTEL as default, org-memory factory learning, swarm/A2A as core
- Mid-session `BeforeToolCall` interception (Cursor owns tools)
- Replacing reviewGate with Auto model routing
- Semantic tool retrieval / hot-reload tools directory (wrong layer)

## Verify this backlog

```bash
bash scripts/check-steal-backlog.sh
```

Asserts P3/P4 files + key phrases, then runs focused vitest for review embedding,
run-report, and risk-profile hooks. Docs/templates are not runtime-enforced
(permissions matrix is governance docs; `REVIEWS.md` laws are judge prompt text).

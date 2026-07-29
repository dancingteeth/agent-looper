---
tags:
  - documentation
  - roadmap
  - competitive
---
# Competitive steal backlog (Jul 2026 session)

Decisions from evaluating Strands, Cursor Router, Kilo Speed, Thariq/Claude Code,
Mastra Factory/Goals, and AI Maker (Wyndo). Merge canvas:
`session-steal-decisions` under the workspace canvases dir.

## Wedge (never trade)

| Axis | agent-loop | Do not adopt |
| --- | --- | --- |
| Exit | Shell `verify` exit `0` | LLM judge 1/0 as sole exit (Mastra Goals) |
| State | Fresh context + git/files | Accumulating thread / summarizers (Strands) |
| Scope | One-repo fix harness | Issue→prod factory UI (Mastra Factory) |

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

## Explicit skips

- OTEL as default, org-memory factory learning, swarm/A2A as core
- Mid-session `BeforeToolCall` interception (Cursor owns tools)
- Replacing reviewGate with Auto model routing
- Semantic tool retrieval / hot-reload tools directory (wrong layer)

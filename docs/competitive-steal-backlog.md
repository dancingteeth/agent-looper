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
[Agent Behavior](https://agentbehavior.dev/) / Braintrust+Basis, NVIDIA Red Team /
NeMo validated-assistant posts, T3 Code automations,
[TrueForge](https://github.com/truefoundry/trueforge),
[Nouri’s production harness notes](https://www.linkedin.com/pulse/production-ready-enterprise-ai-agent-coding-harness-steve-nouri-1x92c/),
[Simmons / Cherny ultraprompting](https://blockbuster.thoughtleader.school/p/ultraprompting-how-the-worlds-top) (Aug 2026),
and [LunarResearcher, Graph Engineering](https://x.com/LunarResearcher/status/2086071302272528833) (8 Aug 2026).
Merge canvas: `session-steal-decisions` under the workspace canvases dir.
Lunar map: `lunar-graph-steal` + `lunar-graph-roadmap` under the workspace canvases dir.

## Wedge (never trade)

| Axis | Agent Looper | Do not adopt |
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

**Better home for deeper steals:** [unified-code-review](https://github.com/dancingteeth/unified-code-review) (sensor for agent-authored process on diffs). Keep Agent Looper thin.

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

## P5 — NVIDIA security / validated assistant + T3 (Aug 2026)

Sources:
[Four Ways to Deploy More Secure AI Agents](https://developer.nvidia.com/blog/four-ways-to-deploy-more-secure-ai-agents/),
[Self-Host a Validated AI Coding Assistant with NeMo Guardrails](https://developer.nvidia.com/blog/how-to-self-host-a-validated-ai-coding-assistant-with-nvidia-nemo-guardrails/),
[pingdotgg/t3code](https://github.com/pingdotgg/t3code) (#3164 automations, #3638 scheduled tasks off-main).

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Model ≠ security control plane | Docs / template | **Shipped** — `templates/LOOP.permissions.example.md` + `templates/REVIEWS.md` | Judge / prompts are residual quality, not egress/secret/RCE controls |
| Default-deny egress + secrets out of agent env | Template rows | **Shipped** — permissions matrix | Already aligned; tightened wording |
| Human-only paths + registry-only installs | Template rows | **Shipped** — permissions matrix | Auth/payments/crypto/deploy; no `git+`/URL installs by default |
| AI-assisted verify extras (secrets / slopsquat / lockfile) | Template | **Shipped** — `templates/verify.ai-assisted.example.sh` + `docs/verification-as-skill.md` | Optional layers on the fixed floor; shell still decides |

### Explicit skips (NVIDIA / T3)

- NeMo Guardrails / NIM self-host stack as harness dependency (wrong layer; consumers wire IDE proxy)
- OpenShell / enterprise sandbox runtime inside Agent Looper (host/platform concern)
- Replacing shell verify with LLM-as-judge for security
- T3 / Linear-style schedule·PR·issue triggers as core harness (factories compose the loop; same skip as P3)

## P6 — TrueForge lean-context steals (Aug 2026)

Source: [truefoundry/trueforge](https://github.com/truefoundry/trueforge) + [trueforge.dev](https://trueforge.dev)
(intro / harness capabilities / large tool responses / benchmarking, 2026-08).
TrueForge is a competing **agent platform** (sessions, MCP, Daytona sandbox, chat UI), not a
coding-agent SDK. Steal **leaner outer-loop context**, not the inner harness.

Do not add `runtime: trueforge`. See [`runtime-map.md`](./runtime-map.md) skip row.

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Sidecar verify logs | Harness | **Shipped** — `verifyLogMode: "sidecar"` | Analog of large-tool offload: worker prompt gets preview + path; full stdout/stderr under `<loop-dir>/verify-logs/`. Default remains `inline`. |
| Progressive skill disclosure | Harness + docs | **Shipped** — `skillDisclosure: "index"` (default) | Worker prompt gets name + description + path; **Read** the `SKILL.md` on demand. `"skillDisclosure": "inline"` pastes full bodies (0.3.0 always inlined). Pin the field on any loop that must keep in-prompt runbooks. MCP schemas stay worker-owned. |
| Same-task runtime cost bench | Docs | **Shipped (docs)** — [`docs/runtime-cost-bench.md`](./runtime-cost-bench.md) | Method only: frozen bundle, n≥3, change one of `runtime` / `model` / `reviewRuntime`, compare `run-report.md`. Dogfood n≥3 numbers still **planned**. Replay one frozen run and change one variable (Nouri evals). Judge is residual quality, never the exit. |

### Explicit skips (TrueForge)

- `runtime: trueforge` / nesting their loop inside this one (wrong shape; competing harness)
- Sandbox-as-tool / Daytona / Code Mode (programmatic tool calling) — worker owns tools; host/platform skip already in P5
- Context compaction / accumulating session summarizers — wedge: fresh context + git/files
- Harness-level subagents — outer loop already isolates iterations; inner `Task` stays with the worker
- Deferred MCP tool loading — same skip as semantic tool retrieval (wrong layer)
- Chat UI / Generative UI / Agents library — factory-UI scope
- Approvals, in-chat OAuth, hosted Postgres/Redis / AI Gateway — product, not a fix-until-green spine

## P7 — Nouri / ultraprompt authoring (Aug 2026)

Sources:
[Production-ready enterprise AI agent coding harness](https://www.linkedin.com/pulse/production-ready-enterprise-ai-agent-coding-harness-steve-nouri-1x92c/)
(Steve Nouri, citing Lovejoy / Marquez), and
[Ultraprompting](https://blockbuster.thoughtleader.school/p/ultraprompting-how-the-worlds-top)
(Michael Simmons on Boris Cherny / Claude Code).

The ultraprompt (goal + check + permission) **is** this harness: `GOAL.md` + `verify.sh` + `maxIterations`.
Steal **authoring discipline**, not Claude `/goal` `/loop` or swarm workflows.
Nouri’s coding half is mostly already shipped (measurable verify, `AGENTS.md`, permissions, worker≠judge, `escalateModel`).

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Revert condition | Docs / template | **Shipped** — `templates/GOAL.metric.template.md` + `templates/verify.metric.example.sh` (`BASELINE_MS`) + design-loop | If measured worse than baseline, fail with revert — do not keep a regression. |
| Four-part finish line | Docs / template | **Shipped** — `templates/GOAL.template.md` + `GOAL.example.md` + design-loop (Cursor + DSH) | Outcome, scoreboard, permission, **budget**. "Don't stop until perfect" is a demo, not a rule. |
| Optional golden artifact | Docs / template | **Shipped** — **Golden** section on `GOAL.template.md` / `GOAL.example.md` / computer-use template | Path to screenshot, fixture, or baseline. Builder ≠ critic stays worker / `reviewGate`. |

Replay-one-variable evals fold into **P6** cost bench (same frozen bundle, swap `runtime` / `model`, compare `run-report.md`). No new event-sourcing layer — `log.ndjson` is the replay surface.

### Explicit skips (Nouri / ultraprompt)

- Immutable enterprise event log + sensitive data in object storage (wrong product; P3 audit surface is enough)
- Humans and LLMs as interchangeable workflow actors beyond existing HITL `waiting`
- Confidence-threshold escalation as the HITL model
- Thousands of subagents / Claude “use a workflow” as harness (swarm skip)
- Claude Code `/loop` routines on Anthropic servers (schedule-trigger skip, same as P3)
- "Don't stop until utterly perfect" as a default stopping rule
- Ultraprompting skill that writes more prompt (anti prompt-diet)

## P8 — Fowler / Horthy context (Aug 2026)

Sources: [Böckeler, Context engineering for coding agents](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
+ [Harness engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html),
[Horthy / HumanLayer, Advanced context engineering](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents)
(and the [blog write-up](https://www.humanlayer.com/blog/advanced-context-engineering)),
[TDD inside the agent loop](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html).

Horthy’s “frequent intentional compaction” is the same constraint Huntley’s Ralph
loop already solves here: **fresh session every iteration**, state in git/files/verify.
Steal the brownfield **research artifact** as preflight (not an inner RPI graph)
and Fowler’s steering language (sensor before prompt).

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Brownfield `RESEARCH.md` before freeze | Template + harness index | **Shipped** — `templates/RESEARCH.example.md` + unknowns-preflight step + `RESEARCH.md` beside GOAL (or `loop.json` `research`) indexed in the worker prompt | Human reads before freeze. Path + one-line only; body is not inlined. Verify still decides. |
| Incorrect info is worse than missing | Docs | **Shipped** — `ARCHITECTURE.md` prompt rank + `templates/REVIEWS.md` / dogfood: cite the capture, do not invent a diagnosis | Raw verify (or sidecar preview) beats an LLM “diagnosis.” |
| Steering loop: sensor before prompt | Docs | **Shipped** — unknowns-preflight “After a run” + REVIEWS authoring: repeated mistake → `verify.sh`, not a new law | Fowler 2×2: GOAL/skills/research = guides; verify = computational sensor; reviewGate = inferential sensor. |

### Explicit skips (Fowler / Horthy)

- Research → Plan → Implement as inner-loop stages (preflight is the right home; Ralph node stays implement-until-green)
- Harness-level subagents / `progress.md` as spine (same skip as P6 compaction; LLM summaries are incorrect-info risk)
- Force TDD inside the worker prompt (Fowler’s eval: design-first beat red-green theater; human-owned tests in `verify.sh` already cover the useful half)
- 40–60% context-utilization gate (no reliable Cursor fill telemetry; fresh sessions already bound rot)

## P9 — M10 (Lunar graph observability)

Source: [LunarResearcher, Graph Engineering](https://x.com/LunarResearcher/status/2086071302272528833) (8 Aug 2026) + vault copy.
Control-flow graph of loops (not GraphRAG, not LangGraph). Inner node is already Ralph.
Steal **named edges + a scoreboard**, not more nodes. Marketing: report card for the loop, not “graph engineering.”

| Item | Adopt as | Deliverable | Notes |
| --- | --- | --- | --- |
| Edge sentences + human-as-edge | Docs | **0.4.5** — ARCHITECTURE §1.1 edge table; HITL is a gated edge on judge→done | Lunar §2–3, §9. Do not add `HUMAN` to `AgentLoopPhase`. |
| Graph spec fields on freeze | Template | **0.4.5** — Unknowns preflight + `GOAL.template.md`: **EDGE DATA**, **REDUCER**, **FAILURE POLICY**, **HUMAN GATE** | Lunar §13. Four-part finish line stays; these name the wiring. |
| Failure-domain policy named | Docs | **0.4.5** — retry / escalate / structured fail / abort; no silent “done” | Skip quorum (no inner fan-out). |
| Graph header on `run-report.md` | Harness | **0.4.5** — report card: phase wall-clock, SDK retries, reviewGate kill rate, HITL, failure-domain rollup, writer vs referee $ | Lunar §11. Telegram completion line uses the same fold. |
| Cost on the critical path | Harness | **0.4.5** — folded into the report card from existing `implement` / `review` usage records | Not a new cost pipeline. |

### Explicit skips (Lunar)

- LangGraph / ADK / AutoGen GraphFlow as the runtime
- Fork/join or parallel `agent-loop-batch` on one git checkout (the dirty tree is a real dependency)
- Tournament / judge council
- Knowledge graph / Neo4j / GraphRAG
- Quorum (“9 of 10 researchers”) — we are not that product
- Marketing the word “graph engineering” to non-builders — the scoreboard is the product

## Verify this backlog

P3–P8 harness hooks are covered by focused vitest (`loopPostReview`, `reviewPrompt`, `loopRunReport`, `loopRiskProfile`, `loopSkills`, `loopResearch`, `loopPrompt`, `loopConfig`). Docs/templates are not runtime-enforced (permissions matrix is governance docs; `REVIEWS.md` laws are judge prompt text). P6 sidecar and progressive skills are shipped (dogfood n≥3 cost numbers still planned). P9 report card + hung-worker escalate + `check-running-loops` ship in **0.4.5**.

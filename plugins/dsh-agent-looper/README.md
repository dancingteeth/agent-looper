---
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
  - plugins
---
# Agent Looper (DSH companion plugin)

Guidance for designing and wiring **[Agent Looper](https://www.npmjs.com/package/@dancingteeth/agent-looper)** inside [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/) (`dsh web`). This bundle **does not** install or replace the `@dancingteeth/agent-looper` CLI — it teaches the DSH agent how to use it.

## What you get

| Component | Purpose |
| --- | --- |
| Skill `design-loop` | Freeze measurable `GOAL.md` + `verify.sh` |
| Skill `install-agent-looper` | npm install, init, scripts (not the grind) |
| Skill `review-gate` | `postQualityReview` / `reviewGate` without thrash |
| Skill `run-loop-in-dsh` | After freeze, start `agent-loop` as bash `run_in_background: true` |
| Command `loop-scaffold` | Guided GOAL + verify scaffold (direct UI — not sent to the model) |
| Prompt + bash guard | Always-on routing; block *foreground* `agent-loop run`; allow background jobs |

Shell **`verify`** (via `agent-loop run`) remains the finish line. DSH built-in `/loop` and `/goal` are not the exit wedge.

## Install locally

Build JS first (`"main"` is `dist/index.js` — DSH will not load `.ts`). Use **Node ≥ 22.15**.

From this repository checkout (plugin package has no local `tsc` — use the repo TypeScript):

```bash
pnpm exec tsc -p plugins/dsh-agent-looper/tsconfig.json
dsh plugin --profile web add ./plugins/dsh-agent-looper
dsh web
```

Optional config on the plugin row in your profile patch:

```yaml
- id: agent-looper
  name: '@dancingteeth/dsh-agent-looper'
  config:
    skillsDir: ./skills
    agentLoopBinary: agent-loop
    blockNestedRun: true
```

## Runtime install (consumer repos)

```bash
pnpm add -D @dancingteeth/agent-looper
pnpm exec agent-loop-init
```

See skill `install-agent-looper` in DSH or [`plugins/agent-looper/`](../agent-looper/) for the Cursor companion.

## Docs

- [`docs/dsh-plugin.md`](../../docs/dsh-plugin.md) — bundle layout and install
- [`docs/cursor-marketplace-plugin.md`](../../docs/cursor-marketplace-plugin.md) — Cursor marketplace twin

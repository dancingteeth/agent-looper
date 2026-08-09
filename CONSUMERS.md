---
tags:
  - documentation
  - agents
---
# Wiring a new consumer repo

Checklist for agents and humans adding **`@dancingteeth/agent-looper`** to any repository (local, CI, or cloud agent).

## Prerequisites

- Consumer uses **pnpm** (or npm/yarn) and **Node.js 22+**
- Registry access to npm (`@dancingteeth/agent-looper`)

## 1. Add the dependency

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
# optional workers:
# pnpm add -D @cline/sdk
# pnpm add -D @opencode-ai/sdk opencode-ai
# pnpm add -D @earendil-works/pi-coding-agent
```

Or in `package.json`:

```json
{
  "devDependencies": {
    "@dancingteeth/agent-looper": "^0.1.0",
    "@cursor/sdk": "^1.0.18"
  }
}
```

## 2. Scaffold repo profile and example loop

From the consumer root:

```bash
pnpm exec agent-loop-init
# edit .cursor/agent-loop.repo.json (hitlProvider, syncCommand, notify hooks, …)
# edit .cursor/loops/example-fix/ — GOAL.md, verify.sh, VERIFY.skill.md
```

Configure HITL / completion notify in the repo profile — see [`docs/hitl-providers.md`](./docs/hitl-providers.md).
If you use Taskwarrior for linked goals, put the **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` (never numeric ID alone).

## 3. Wire scripts (recommended)

```json
{
  "scripts": {
    "agent:init": "agent-loop-init",
    "agent:check": "doppler run -- agent-check cursor",
    "agent:loop": "doppler run -- agent-loop run",
    "agent:doctor": "agent-loop-doctor"
  }
}
```

## 4. Consumer integration test (recommended)

Add a small smoke test that imports `@dancingteeth/agent-looper` and asserts your repo profile / init layout loads. Point a loop bundle’s `verify` at that test so the harness stays honest.

## 5. Document in the consumer repo

Keep a short loop runbook with:

- Install line (`pnpm add -D @dancingteeth/agent-looper @cursor/sdk`)
- Required env keys (`CURSOR_API_KEY`, …)
- How to run `pnpm agent:loop .cursor/loops/<name>`

## Harness maintainers only (`file:` / sibling checkout)

Developing **this** package against a consumer before a release: you may still use
`"@dancingteeth/agent-looper": "file:../agent-looper"` (or `file:../agent-loop` if your checkout folder still uses the old name) and `pnpm ensure-link`. Prefer
publishing to npm for everyone else — see [`docs/releasing.md`](./docs/releasing.md)
and [`docs/dogfood.md`](./docs/dogfood.md).

## Docker / production images

Loop CLIs are **dev-only**. Keep `@dancingteeth/agent-looper` in `devDependencies` so production images do not need it.

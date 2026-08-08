---
tags:
  - documentation
  - agents
---
# Wiring a new consumer repo

Checklist for agents and humans adding **`@dancingteeth/agent-looper`** to another repository (Maxin, Zwook, cloud agent, or greenfield).

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

Cloud / Cursor agents: same install — no sibling checkout or `file:` link required.

## 2. Scaffold repo profile and example loop

From the consumer root:

```bash
pnpm exec agent-loop-init
# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
# edit .cursor/loops/example-fix/ — GOAL.md, verify.sh, VERIFY.skill.md
```

Use Taskwarrior **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` — see
[`docs/verification-as-skill.md`](./docs/verification-as-skill.md).

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

Add a smoke test that imports the package and asserts your repo profile — copy from:

- Maxin: `src/lib/agentLoop.integration.test.ts`
- Zwook: `test/agent-loop.integration.test.mjs`

Point a loop bundle's `verify` at that test (see `.cursor/loops/system-smoke` in Maxin).

## 5. Document in the consumer repo

Add a short loop runbook (e.g. `docs/CURSOR_SDK_LOOPS.md`) with:

- Install line (`pnpm add -D @dancingteeth/agent-looper @cursor/sdk`)
- Required env keys (`CURSOR_API_KEY`, …)
- How to run `pnpm agent:loop .cursor/loops/<name>`

## Harness maintainers only (`file:` / sibling checkout)

Developing **this** package against a consumer before a release: you may still use
`"@dancingteeth/agent-looper": "file:../agent-loop"` and `pnpm ensure-link`. Prefer
publishing to npm for everyone else — see [`docs/releasing.md`](./docs/releasing.md)
and [`docs/dogfood.md`](./docs/dogfood.md).

## Reference consumers

| Repo | Preferred install | Runbook |
|------|-------------------|---------|
| Maxin DXP | npm `@dancingteeth/agent-looper` | `multi-store/payload-ecommerce/docs/CURSOR_SDK_LOOPS.md` |
| Zwook | npm `@dancingteeth/agent-looper` | `zwook/docs/CURSOR_SDK_LOOPS.md` |

## Docker / production images

Loop CLIs are **dev-only**. Keep `@dancingteeth/agent-looper` in `devDependencies` so production images do not need it.

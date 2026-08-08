---
name: install-agent-looper
description: >-
  Install and wire @dancingteeth/agent-looper in a consumer repo — dependency,
  agent-loop-init, scripts, and first dogfood run. Use when adding the harness
  or debugging why the CLI is missing.
---

# Install Agent Looper

This plugin does **not** ship the harness binary. Install the npm package.

## Dependency

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
# optional workers / judges:
# pnpm add -D @cline/sdk
# pnpm add -D @opencode-ai/sdk opencode-ai
# pnpm add -D @earendil-works/pi-coding-agent
```

Node **22+**. Package: `@dancingteeth/agent-looper` (GitHub repo remains `dancingteeth/agent-loop`).

## Scaffold

```bash
pnpm exec agent-loop-init
```

Then edit:

- `.cursor/agent-loop.repo.json` — `taskwarriorProject`, `syncCommand`, `defaultBranch`, …
- `.cursor/loops/example-fix/` — replace with a real GOAL + verify

## Scripts (recommended)

```json
{
  "scripts": {
    "agent:loop": "doppler run -- agent-loop run",
    "agent:check": "doppler run -- agent-check cursor",
    "agent:init": "agent-loop-init"
  }
}
```

## Dogfood this harness repo

Build `dist/` (`pnpm build`) and run via repo scripts — see `docs/dogfood.md`.

## Confirm install

```bash
pnpm exec agent-loop --help
npm view @dancingteeth/agent-looper version
```

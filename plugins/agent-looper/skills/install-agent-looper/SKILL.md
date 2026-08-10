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
# pnpm add -D @openai/codex-sdk
```

Node **22+**. Package: `@dancingteeth/agent-looper` (GitHub: `dancingteeth/agent-looper`).

## Scaffold

```bash
pnpm exec agent-loop-init
```

Then edit:

- `.cursor/agent-loop.repo.json` — `hitlProvider`, notify hooks, `syncCommand`, `defaultBranch`, …
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

## Long runs from Cursor chat

### Local Agent

To start a loop in the **background** and wake this chat when it finishes:

1. Run `agent-loop run .cursor/loops/<name>` in a background shell.
2. Use Shell `notify_on_output` with pattern `^AGENT_LOOP_DONE `.
3. On notification, parse the JSON on that stdout line and read `runReport` / `run-report.md`.

Disable the line with `--no-completion-signal` or `AGENT_LOOP_NO_COMPLETION_SIGNAL=1`.

### Cloud Agents

Cloud Shell **does not expose `notify_on_output`**, so you cannot attach that watcher even though the harness still prints `AGENT_LOOP_DONE` (before time-capped webhook/`notifyCommand`/PR comment). Prefer `notifyWebhook` / `notifyPrComment` / Telegram / HITL. After a loop, commit `.cursor/loop-exports/<slug>/` on the PR branch so meta-review can see reviews. OpenCode workers use `promptAsync` + heartbeats (0.1.10+); do not treat `layer=transport` as loop done. Meta-review: `--review-runtime opencode` when Cursor judge keys fail. Revisit in-chat wake only if Cursor adds Cloud Shell `notify_on_output`.

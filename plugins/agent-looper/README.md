---
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---
# Agent Looper (Cursor companion plugin)

Guidance for designing and wiring **[Agent Looper](https://www.npmjs.com/package/@dancingteeth/agent-looper)** — the fix-until-green harness. This plugin does **not** install the CLI; it teaches the IDE agent how to use it.

## What you get

| Component | Purpose |
| --- | --- |
| Skill `design-loop` | Freeze measurable `GOAL.md` + `verify.sh` |
| Skill `install-agent-looper` | npm install, init, scripts |
| Skill `review-gate` | `postQualityReview` / `reviewGate` without thrash |
| Skill `check-running-loops` | Is `agent-loop` actually alive vs stale/hung/dead (any runtime). Also shipped in the npm tarball; `agent-loop-init` copies it into `.cursor/skills/` and `.agents/skills/`. |
| Rule `agent-looper` | Sparse working agreements |
| Command `/loop-scaffold` | Guided loop bundle creation |

## Install locally (before marketplace)

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn /ABS/PATH/TO/agent-looper/plugins/agent-looper ~/.cursor/plugins/local/agent-looper
```

Reload the Cursor window, then exercise the skills / `/loop-scaffold`.

## Marketplace

Repo uses a multi-plugin layout:

- `.cursor-plugin/marketplace.json` — registry entry
- `plugins/agent-looper/.cursor-plugin/plugin.json` — Cursor Plugin manifest
- `plugins/agent-looper/plugin.json` — portable [Agent Plugins](https://agent-plugins.org) manifest (skills-only clients, including Agent Looper itself)

Submit the **repository** URL at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) after local testing.

## Harness dogfood

In this repo, loops can attach these skills via:

```json
{
  "plugins": ["plugins/agent-looper"]
}
```

The worker prompt indexes name + description by default (`skillDisclosure: "index"`).

## Runtime install

```bash
pnpm add -D @dancingteeth/agent-looper @cursor/sdk
pnpm exec agent-loop-init
```

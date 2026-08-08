---
tags:
  - documentation
  - plugins
  - cursor
  - marketplace
---
# Cursor marketplace companion plugin

Agent Looper’s IDE companion lives at [`plugins/agent-looper/`](../plugins/agent-looper/).

It packages **skills / rules / commands** that teach Cursor how to design loops and wire the npm harness. It does **not** replace `@dancingteeth/agent-looper`.

## Layout

| Path | Role |
| --- | --- |
| [`.cursor-plugin/marketplace.json`](../.cursor-plugin/marketplace.json) | Multi-plugin marketplace manifest |
| [`plugins/agent-looper/.cursor-plugin/plugin.json`](../plugins/agent-looper/.cursor-plugin/plugin.json) | Cursor Plugin manifest |
| [`plugins/agent-looper/plugin.json`](../plugins/agent-looper/plugin.json) | Portable Agent Plugins 1.0.0 manifest (skills) |
| `plugins/agent-looper/skills/` | `design-loop`, `install-agent-looper`, `review-gate` |
| `plugins/agent-looper/rules/` | Sparse working agreements |
| `plugins/agent-looper/commands/loop-scaffold.md` | Guided scaffold command |

## Local test

```bash
mkdir -p ~/.cursor/plugins/local
ln -sfn "$(pwd)/plugins/agent-looper" ~/.cursor/plugins/local/agent-looper
```

Reload Cursor, then try `/loop-scaffold` or invoke the skills.

Structural check (same script as [cursor/plugin-template](https://github.com/cursor/plugin-template)):

```bash
node scripts/validate-cursor-plugin.mjs
```

Expected: **Validation passed.** Missing `hooks/` / `mcp.json` warnings are fine (we do not ship those).

## Publish

1. Local-test as above
2. Submit the **repo** URL at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)
3. Wait for Cursor manual review

## Harness dogfood

```json
{ "plugins": ["plugins/agent-looper"] }
```

Loads the Agent Plugins `plugin.json` + `skills/*/SKILL.md` into worker prompts (see [`docs/agent-plugins.md`](./agent-plugins.md)).

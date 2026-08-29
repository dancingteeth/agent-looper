---
tags:
  - documentation
  - plugins
  - skills
  - agentic_ai
  - agents
  - loops
---
# Agent Plugins (skills-only client)

Agent Looper implements a **skills-only** [Agent Plugins](https://agent-plugins.org/client-implementers) client:

- Loads a plugin directory with root `plugin.json`
- Validates the **1.0.0** manifest locally (`$schema` must be the canonical id — never fetched)
- Discovers immediate `skills/*/SKILL.md` entries and puts **name + description + path** in the worker prompt (`skillDisclosure: "index"`, default). Set `"skillDisclosure": "inline"` to paste full bodies (tiny loops / 0.3.0 behavior). Loops that omit the field now get the index, not inlined runbooks.
- Ignores `mcp.json` — MCP stays with the worker agent SDK (`runtime`)

Conformance: a client must support **skills or MCP**; skills alone is enough.

## Configure

In `loop.json`:

```json
{
  "plugins": ["templates/agent-plugin.example"],
  "skills": ["packages/skills/coding-standard/SKILL.md"],
  "skillDisclosure": "index"
}
```

Paths are relative to the repo root (absolute paths also work). Skill paths from plugins merge with explicit `skills` and GOAL `packages/skills/.../SKILL.md` references (deduped). Default disclosure is an **index** (Read the file when relevant). MCP is still ignored.

Broken plugins are skipped with a stderr warning (fail-open per entry). Missing `skills/` is valid absence.

## Example package

See [`templates/agent-plugin.example/`](../templates/agent-plugin.example/) for a minimal conformant layout.

Cursor marketplace companion (skills + rules + commands): [`plugins/agent-looper/`](../plugins/agent-looper/) — see [`docs/cursor-marketplace-plugin.md`](./cursor-marketplace-plugin.md).

DeepSeek Harness companion (skills + human command, Cordis bundle): [`plugins/dsh-agent-looper/`](../plugins/dsh-agent-looper/) — see [`docs/dsh-plugin.md`](./dsh-plugin.md). Shared skill bodies are symlinked from [`plugins/agent-looper/skills/`](../plugins/agent-looper/skills/) (SSOT); only `run-loop-in-dsh` is DSH-native.

## Spec links

- [Client implementers](https://agent-plugins.org/client-implementers)
- [agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec)

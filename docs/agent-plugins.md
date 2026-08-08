---
tags:
  - documentation
  - plugins
  - skills
---
# Agent Plugins (skills-only client)

Agent Looper implements a **skills-only** [Agent Plugins](https://agent-plugins.org/client-implementers) client:

- Loads a plugin directory with root `plugin.json`
- Validates the **1.0.0** manifest locally (`$schema` must be the canonical id — never fetched)
- Discovers immediate `skills/*/SKILL.md` entries and inlines them into worker prompts
- Ignores `mcp.json` — MCP stays with the worker runtime (Cursor / Cline / OpenCode / Pi)

Conformance: a client must support **skills or MCP**; skills alone is enough.

## Configure

In `loop.json`:

```json
{
  "plugins": ["templates/agent-plugin.example"],
  "skills": ["packages/skills/coding-standard/SKILL.md"]
}
```

Paths are relative to the repo root (absolute paths also work). Skill paths from plugins merge with explicit `skills` and GOAL `packages/skills/.../SKILL.md` references (deduped).

Broken plugins are skipped with a stderr warning (fail-open per entry). Missing `skills/` is valid absence.

## Example package

See [`templates/agent-plugin.example/`](../templates/agent-plugin.example/) for a minimal conformant layout.

Cursor marketplace companion (skills + rules + commands): [`plugins/agent-looper/`](../plugins/agent-looper/) — see [`docs/cursor-marketplace-plugin.md`](./cursor-marketplace-plugin.md).

## Spec links

- [Client implementers](https://agent-plugins.org/client-implementers)
- [agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec)

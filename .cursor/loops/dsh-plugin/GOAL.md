---
tags:
  - documentation
  - agents
  - loops
  - dogfood
  - plugins
---
# DeepSeek Harness companion plugin

## Goal

Ship an installable **DeepSeek Harness (DSH) companion plugin** for Agent Looper — the same job as [`plugins/agent-looper/`](../../../plugins/agent-looper/) does for Cursor, but as a Cordis bundle (`dsh.bundle` + `cordis.patch.yml`) that loads inside `dsh web`.

It **teaches and scaffolds** Agent Looper (`GOAL.md` + shell `verify` + `agent-loop` CLI). It does **not** replace `@dancingteeth/agent-looper`, and it must **not** treat DSH’s built-in `/loop` / `/goal` as the exit (shell `verify` remains the wedge).

Canonical layout: `plugins/dsh-agent-looper/`. Docs: `docs/dsh-plugin.md`.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`). Checks live in `verify.sh` / `VERIFY.skill.md`.

### Bundle contract

- New package at `plugins/dsh-agent-looper/` with its own `package.json`:
  - `"name": "@dancingteeth/dsh-agent-looper"`
  - `"type": "module"`
  - `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
  - `keywords` includes `dsh-plugin`
- `cordis.patch.yml` inserts one plugin row (`id: agent-looper`) whose `name` resolves to that package.
- Entry module uses **named** exports (not a default-export-only plugin): `name`, `apply`, and `inject` including `skills` and `commands`.
- `apply(ctx)` registers capabilities through `ctx` so unload reverts them (Cordis temporal composability — no manual leftover listeners).
- Tunable values (skill directory, binary name) live on a Schemastery `Config` export — not hardcoded constants.

### Companion surface (parity with Cursor plugin)

Register the same three skills the Cursor companion ships, kebab-case names, with bodies that match the existing runbooks (reuse or package copies of `plugins/agent-looper/skills/*/SKILL.md`):

1. `design-loop`
2. `install-agent-looper`
3. `review-gate`

Register human command `loop-scaffold` (`ctx.commands.register`) — description must mention Agent Looper / GOAL+verify scaffold. Handler may return guidance text; it must not send the slash line to the model (commands are direct UI).

### Tests and docs

- Unit tests mock `ctx.skills` / `ctx.commands` (no live `dsh web`, no API key). Assert `apply` registers the three skills and `loop-scaffold`.
- `docs/dsh-plugin.md` explains: what it is, install via `dsh plugin --profile web add ./plugins/dsh-agent-looper`, that it does not replace the CLI, and a pointer from `docs/cursor-marketplace-plugin.md` / `docs/agent-plugins.md`.
- Plugin README at `plugins/dsh-agent-looper/README.md`.
- Root `@dancingteeth/agent-looper` `package.json` must **not** gain a runtime dependency on `@deepseek-ai/dsh` / `deepseek-harness`. Plugin deps stay inside the plugin package (peer `@deepseek-ai/cordis` is fine).

### Explicit non-goals encoded as guards

- No new harness `runtime: dsh`.
- No change to `src/loop/` orchestration (verify-first exit stays in the CLI).
- Verify must pass **offline** (no `dsh web` process, no DeepSeek API).

## Constraints

- Scope: `plugins/dsh-agent-looper/`, `docs/dsh-plugin.md`, and a short cross-link in existing plugin docs. Do not refactor the Cursor companion except to add that link.
- **Do not edit this `GOAL.md` during the loop.**
- Follow current DSH docs (plugin `apply` + bundle patch + skills/commands seams). Do not invent a second plugin format.
- Network in the worker is only for reading DSH docs if types/APIs are unclear; verify is local.

## Out of scope

- `npx @deepseek-ai/dsh web` as a verify step (manual dogfood after freeze)
- npm publish, GitHub `dsh-plugin` topic, marketplace listing (root `package.json` is the CLI package — do not add `dsh.bundle` there)
- Reimplementing Agent Looper inside DSH `/loop` / `ctx.goals`
- New worker runtime, Cline/OpenCode/Pi/Codex changes
- Changing Cursor marketplace manifests

## Unknowns accepted

- Exact `inject` service ids and `SkillRegistration` fields follow upstream DSH/Cordis types at implement time; tests mock the registry, not the full kernel.
- Live load via `--dump-config` is a **manual** check after the loop (writes `$DSH_HOME`); not in `verify.sh`.

## References

- Cursor companion: `plugins/agent-looper/`, `docs/cursor-marketplace-plugin.md`
- DSH: [first plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/), [package a plugin](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish), [skills](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/skills), [commands](https://deepseek-harness.github.io/deepseek-harness/en/reference/subsystems/commands)
- Cordis paper (unload = revert effects): https://github.com/cordiverse/paper
- Topic discovery: https://github.com/topics/dsh-plugin

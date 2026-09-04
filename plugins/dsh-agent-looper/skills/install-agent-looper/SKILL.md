---
name: install-agent-looper
description: Install the Agent Looper CLI in the current repo. Use only when `agent-loop --help` is missing. Do not dump Doppler or OpenCode secrets.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
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
# pnpm add -D @muse-code/sdk
```

Node **22+**. Package: `@dancingteeth/agent-looper`. Confirm with `pnpm exec agent-loop --help` (not `--version` — extra args are treated as a loop dir).

## Scaffold

```bash
pnpm exec agent-loop-init
# or, from an idea: pnpm exec agent-loop-prompt --out .cursor/loops/<task>
```

Then edit `.cursor/agent-loop.repo.json` (HITL, notify, **`defaults`** for runtime/models) and replace `.cursor/loops/example-fix/`. Humans run `pnpm exec agent-loop-setup` once; agents skip the TUI and use `--answers` or a sparse `loop.json` (`verify` + overrides). Init also copies **check-running-loops** to `.cursor/skills/` and `.agents/skills/`.

## Keys (env, not Doppler dumps)

Looper reads **`process.env`**. Doppler is optional wrapping.

- Bare `doppler run -- cmd` **fails** with `You must specify a project` unless this directory is Doppler-scoped.
- Pass the project: `doppler run --project <name> --config <config> -- agent-loop run …`
- Or skip Doppler: `export OPENCODE_API_KEY=…` (OpenCode Go may already be in CLI auth — **do not cat** `~/.local/share/opencode/auth.json`).
- Never `doppler secrets`, never `cat ~/.doppler.yaml`, never inline `DOPPLER_TOKEN`.

```json
{
  "scripts": {
    "agent:loop": "doppler run --project <name> --config <config> -- agent-loop run",
    "agent:check": "doppler run --project <name> --config <config> -- agent-check opencode",
    "agent:init": "agent-loop-init"
  }
}
```

If they do not use Doppler, drop `doppler run` and keep `agent-loop run` / `agent-check opencode`.

## First dogfood run

Load `run-loop-in-dsh` and start `agent-loop run` with bash **`run_in_background: true`**. Do not foreground-bash the grind (~60s timeout).

# @dancingteeth/agent-loop

Repo-agnostic **fix-until-green** agent loop: fresh agent context per iteration, shell verifier, `log.ndjson`, optional Taskwarrior hooks.

Supports **Cursor SDK** (`composer-2.5`) and **ClinePass** (`cline-pass/deepseek-v4-flash`, etc.).

## Install

```bash
pnpm add -D @dancingteeth/agent-loop @cline/sdk
# optional, for post-loop review:
pnpm add -D @cursor/sdk
```

Or link during development:

```bash
cd ~/Projects/agent-loop && pnpm link --global
cd ~/Projects/zwook && pnpm link -g @dancingteeth/agent-loop
```

Requires **Node.js 22+** for ClinePass.

## Quick start

From any repository root:

```bash
# scaffold profile + example loop
agent-loop-init

# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
# edit .cursor/loops/my-task/GOAL.md + loop.json

doppler run -- agent-check cline
doppler run -- agent-loop run .cursor/loops/my-task --runtime cline-pass
```

Run against another checkout:

```bash
agent-loop run /path/to/zwook/.cursor/loops/fix-foo --repo-root /path/to/zwook
```

## Repo profile

`.cursor/agent-loop.repo.json`:

| Field | Purpose |
|-------|---------|
| `taskwarriorProject` | HITL tasks land here (`dxp`, `zwook`, …) |
| `syncCommand` | Shell command after success (`pnpm tasks:sync` or `null`) |
| `defaultBranch` | Post-loop diff base (`main`) |
| `agentsFile` / `reviewsFile` | Prompt + review paths |
| `skillsGlob` | System prompt skills hint |
| `clientName` | Cline client label |

Per-loop overrides in `loop.json`: `taskwarriorProject`, `taskwarriorUuid`, `hitlCheck`.

## Loop bundle

```
.cursor/loops/my-task/
  GOAL.md      # frozen spec
  loop.json    # verify command, runtime, model, TW uuid
  log.ndjson   # append-only iteration log
```

`loop.json` legacy field `syncPostgres` maps to `syncOnSuccess`.

## CLIs

| Command | Description |
|---------|-------------|
| `agent-loop run <dir>` | Single loop |
| `agent-loop-batch <dir>` | `loop-batch.json` sequential runs |
| `agent-check cursor\|cline` | SDK + API key smoke |
| `agent-loop-init` | Scaffold templates |

## Consumer `package.json` scripts

**Maxin:**

```json
{
  "scripts": {
    "agent:loop": "doppler run --project maxin_dxp --config dev -- agent-loop run",
    "agent:check": "doppler run --project maxin_dxp --config dev -- agent-check cline"
  }
}
```

Profile: `"syncCommand": "pnpm tasks:sync"`, `"taskwarriorProject": "dxp"`.

**Zwook:**

```json
{
  "scripts": {
    "agent:loop": "doppler run --project zwook --config dev -- agent-loop run"
  }
}
```

Profile: `"taskwarriorProject": "zwook"`, `"syncCommand": null`.

## Architecture

```
GOAL.md + loop.json → fresh agent → shell verify (exit 0?) → log.ndjson → repeat
```

Post-success (optional): Cursor quality review → `task uuid:… done` → HITL task → `syncCommand`.

## License

MIT

---
tags:
  - documentation
  - agents
---
# Wiring a new consumer repo

Checklist for agents and humans adding **`@dancingteeth/agent-loop`** to another repository (Maxin, Zwook, or a greenfield project).

## Prerequisites

- Harness checkout at `~/Projects/agent-loop` (this repo)
- Consumer uses **pnpm** and **Node.js 22+** (for ClinePass)
- Relative `file:` path from consumer `package.json` to the harness checkout

## 1. Add the dependency

In the consumer `package.json` `devDependencies`:

```json
{
  "devDependencies": {
    "@dancingteeth/agent-loop": "file:../agent-loop",
    "@cline/sdk": "^0.0.55",
    "@cursor/sdk": "^1.0.18"
  }
}
```

Adjust the path for your layout:

| Consumer location | Typical specifier |
|-------------------|-----------------|
| `~/Projects/zwook` | `file:../agent-loop` |
| `~/Projects/multi-store/payload-ecommerce` | `file:../../agent-loop` |

The resolved path **must exist on disk** before `pnpm install` (sibling checkout or symlink).

## 2. Create the sibling link (one-time per machine)

From **this repo** (`agent-loop`):

```bash
pnpm ensure-link ~/Projects/<path-to-consumer>
cd ~/Projects/agent-loop && pnpm install && pnpm build
cd ~/Projects/<path-to-consumer> && pnpm install
```

Or manually:

```bash
ln -sf ~/Projects/agent-loop <expected-sibling-path>
```

`pnpm ensure-link` reads the consumer's `file:` specifier and creates the symlink when missing.

## 3. Postinstall guard (copy from an existing consumer)

Add `scripts/agent-loop/postinstall-check.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

if [[ "${SKIP_AGENT_LOOP_DOCTOR:-}" == "1" ]]; then
  exit 0
fi

if ! pnpm exec node -e "import('@dancingteeth/agent-loop')" >/dev/null 2>&1; then
  exit 0
fi

pnpm exec agent-loop-doctor --install-check
```

In consumer `package.json` scripts:

```json
{
  "scripts": {
    "postinstall": "bash scripts/agent-loop/postinstall-check.sh",
    "agent:doctor": "pnpm exec agent-loop-doctor",
    "agent:loop": "doppler run --project <doppler-project> --config dev -- pnpm exec agent-loop run",
    "agent:init": "pnpm exec agent-loop-init"
  }
}
```

Set `SKIP_AGENT_LOOP_DOCTOR=1` in Docker/prod builds that stub agent-loop (see Maxin `scripts/docker/stub-agent-loop-for-install.sh`).

## 4. Scaffold repo profile and example loop

From the consumer root:

```bash
pnpm agent:init
# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
```

## 5. Consumer integration test (recommended)

Add a smoke test that imports the package and asserts your repo profile — copy from:

- Maxin: `src/lib/agentLoop.integration.test.ts`
- Zwook: `test/agent-loop.integration.test.mjs`

Point a loop bundle's `verify` at that test (see `.cursor/loops/system-smoke` in Maxin).

## 6. Document in the consumer repo

Add a **Repo layout** section to the consumer's loop runbook (e.g. `docs/CURSOR_SDK_LOOPS.md`) with:

- The exact `file:` specifier for that repo
- The `ensure-link` one-liner for that path
- `pnpm agent:doctor` for diagnostics

## Guards (automatic)

| When | What |
|------|------|
| `pnpm install` in agent-loop | `prepare` builds `dist/` if incomplete |
| `pnpm install` in consumer | `postinstall` → `agent-loop-doctor --install-check` |
| Anytime | `pnpm agent:doctor` or `pnpm exec agent-loop-doctor` |

If install fails with a missing `file:` path or incomplete `dist/`, doctor prints exact `ln -sf` and rebuild commands.

## Reference consumers

| Repo | `file:` specifier | Runbook |
|------|-------------------|---------|
| Maxin DXP | `file:../../agent-loop` | `multi-store/payload-ecommerce/docs/CURSOR_SDK_LOOPS.md` |
| Zwook | `file:../agent-loop` | `zwook/docs/CURSOR_SDK_LOOPS.md` |

## Docker / production images

If the consumer builds Docker images and `file:../../agent-loop` is outside the build context, stub the package before `pnpm install` (Maxin: `scripts/docker/stub-agent-loop-for-install.sh`). The stub must include a no-op `dist/cli/doctor.js` so `postinstall` succeeds.

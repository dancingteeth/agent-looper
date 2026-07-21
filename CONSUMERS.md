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

In the consumer `package.json` `optionalDependencies` (dev harness — not required on CI/Docker):

```json
{
  "optionalDependencies": {
    "@dancingteeth/agent-loop": "file:../agent-loop"
  },
  "devDependencies": {
    "@cline/sdk": "^0.0.55",
    "@cursor/sdk": "^1.0.18"
  }
}
```

Adjust the path for your layout:

| Consumer location | Typical specifier | Install kind |
|-------------------|-------------------|--------------|
| `~/Projects/zwook` | `file:../agent-loop` | `optionalDependencies` |
| `~/Projects/multi-store/payload-ecommerce` | `file:../../agent-loop` | `optionalDependencies` |

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

## 3. Optional import helper (copy from an existing consumer)

Add `lib/loadAgentLoop.mjs` (Zwook) or `src/lib/tasks/loadAgentLoop.ts` (Maxin) — dynamic import + `isAgentLoopInstalled()` so CI passes without the sibling checkout.

Consumer integration tests use `describe.skip` / `{ skip: !isAgentLoopInstalled() }` when the package is absent.

## 4. Scaffold repo profile and example loop

From the consumer root:

```bash
pnpm agent:init
# edit .cursor/agent-loop.repo.json (taskwarriorProject, syncCommand, …)
# edit .cursor/loops/example-fix/ — GOAL.md, verify.sh, VERIFY.skill.md
```

Use Taskwarrior **UUID** in `GOAL.md` and `loop.json` `taskwarriorUuid` — see
[`docs/verification-as-skill.md`](../docs/verification-as-skill.md).

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
| `pnpm install` in consumer (local dev) | Optional `file:` link when sibling exists |
| Anytime (dev) | `pnpm agent:doctor` or `pnpm exec agent-loop-doctor` |

If install fails with a missing `file:` path or incomplete `dist/`, doctor prints exact `ln -sf` and rebuild commands.

### `ERR_MODULE_NOT_FOUND` for `dist/loop/loopSkills.js` (or other dist files)

Symptom: `pnpm agent:loop` fails in the consumer even though `agent-loop-doctor` previously reported OK.

Cause: sibling `agent-loop` was rebuilt but the consumer's pnpm `file:` copy is stale, or `pnpm prepare` failed silently (TypeScript syntax in `prepare-package.mjs`).

Fix:

```bash
cd ~/Projects/agent-loop && pnpm install && pnpm build
cd ~/Projects/<consumer> && pnpm install
pnpm exec agent-loop-doctor
```

Doctor now smoke-loads `dist/cli/run.js` so missing modules are caught before loops start.

## Reference consumers

| Repo | `file:` specifier | Runbook |
|------|-------------------|---------|
| Maxin DXP | `file:../../agent-loop` | `multi-store/payload-ecommerce/docs/CURSOR_SDK_LOOPS.md` |
| Zwook | `file:../agent-loop` | `zwook/docs/CURSOR_SDK_LOOPS.md` |

## Docker / production images

Consumers use `optionalDependencies` for the `file:` sibling so `pnpm install` succeeds when the harness checkout is outside the build context. Loop CLIs are dev-only; production images do not need agent-loop.

---
tags:
  - documentation
  - loops
  - dogfood
---
# Dogfooding agent-loop on itself

This repo is both the **harness package** and a **consumer**. Loops live under
`.cursor/loops/`; profile is `.cursor/agent-loop.repo.json`
(`taskwarriorProject: agent-loop`).

## Why not publish to npm first?

Consumers already use `file:../agent-loop`. Dogfood runs against local `dist/`:

```bash
pnpm build
pnpm agent:loop run .cursor/loops/<name> --runtime cursor --review-gate
# or: doppler run -- pnpm agent:loop run …
```

Publish to npm only when you want install without a sibling checkout.

## Active loops

| Loop | TW UUID | Feature |
| --- | --- | --- |
| `reproduce-before-report` | `b2185d70-2889-4eed-94c2-d99949954211` | M2 phase 2a — deterministic path filter |
| `example-fix` | — | Scaffold template only |

## Review overlays

- Per-loop gate: slim harness prompt + root `REVIEWS.md` (from `templates/REVIEWS.md`)
- Full chat review: unified-code-review skill (not inlined into gates)
- Meta-review (M5): [`meta-review-prompt.md`](./meta-review-prompt.md)

## Workflow

1. Create / edit loop: `GOAL.md`, `loop.json`, `verify.sh`, `VERIFY.skill.md`.
2. Put Taskwarrior **UUID** in GOAL + `taskwarriorUuid`.
3. Implement (human or `pnpm agent:loop …`).
4. Pass: `bash .cursor/loops/<name>/verify.sh`.
5. Commit; `task <uuid> done` if not auto-completed.

## Caveat

The CLI runs from **`dist/`** while the agent edits **`src/`**. Always rebuild
or let `verify` typecheck/test from source so the judge stays honest.

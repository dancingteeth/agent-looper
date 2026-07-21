---
tags:
  - documentation
  - loops
  - verification
---
# Verification-as-skill

Track **A** of roadmap milestone **M4** ([`loop-review-roadmap.md`](./loop-review-roadmap.md)).
Taskwarrior: `fe3f4076-b997-4d28-a59a-baf720c28e5d` (project `agent-loop`).

## Why

`loop.json` `verify` is a shell command (exit `0` = done). The highest-leverage quality
move is to make that command wrap a **quantitative checklist** — same steps every
iteration, no "looks good" handoff.

The harness does **not** run agent skills as `verify` yet (Track B: optional
`verifyMode: 'skill'`). Today you wire:

1. `verify.sh` — executable steps the shell runs.
2. `VERIFY.skill.md` — procedure the implementer agent follows when writing/fixing code.

Both live beside `GOAL.md` in the loop directory.

## Scaffold (agent-loop-init)

```bash
agent-loop-init
```

Creates:

```
.cursor/loops/example-fix/
  GOAL.md
  loop.json          # verify → bash .cursor/loops/example-fix/verify.sh
  verify.sh          # from templates/verify.example.sh
  VERIFY.skill.md    # checklist + rules
```

Copy `example-fix` to your task name and edit all four files.

## Taskwarrior UUIDs (required convention)

Numeric Taskwarrior IDs are **not stable** (recycled). Always use **UUID**:

| Where | Field |
| --- | --- |
| `GOAL.md` | `**UUID:** \`<uuid>\`` (traceability in commits / review) |
| `loop.json` | `"taskwarriorUuid": "<uuid>"` (auto `task done` on loop success) |

```bash
task <uuid> info          # inspect
task <uuid> done          # manual complete
```

Get UUID from `task export`, `task <id> info`, or your tasks sync output — never
commit numeric ID alone in `loop.json`.

## Example loop.json

```json
{
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "finalVerify": "bash .cursor/loops/my-task/final-verify.sh",
  "taskwarriorUuid": "a74a94d1-2069-4e05-861e-de80143b0526"
}
```

`finalVerify` is optional — stricter outer gate (deploy + smoke) after inner `verify`.

## Authoring verify.sh

- `set -euo pipefail` at the top.
- Echo `[verify] step N` before each check (shows up in loop logs).
- Prefer **narrow** commands (one test file, one script) over whole-suite runs when
  iterating — keep `finalVerify` for the heavy path.
- Exit non-zero on any failed assertion; the loop will not complete.

## GOAL.md tips

Under **Acceptance criteria**, link the verifier explicitly:

```markdown
- Success is determined **only** by `loop.json` `verify` (exit `0`).
- Measurable checks live in `verify.sh` and `VERIFY.skill.md`.
```

Preflight warns when GOAL.md does not mention measurable verify artifacts.

## Track B (not shipped)

Future: `verifyMode: "command" | "skill"` so the harness can invoke a Cursor/Cline skill
as the verify phase. Track A stays the default and does not change the pipeline.

## Related tasks (UUIDs)

| Milestone | UUID | Summary |
| --- | --- | --- |
| M1 | `8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6` | Impact-severity contract |
| M2 | `b2185d70-2889-4eed-94c2-d99949954211` | Reproduce-before-report |
| M3 | `adf66bf8-d52a-43e2-8009-756649cc32b2` | Multi-family review judge |
| M4 | `fe3f4076-b997-4d28-a59a-baf720c28e5d` | Verification-as-skill (this doc) |
| M5 | `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00` | Cross-loop meta-review CLI |

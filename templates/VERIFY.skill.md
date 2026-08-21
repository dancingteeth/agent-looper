---
name: loop-verify
description: Run the measurable verification checklist for an Agent Looper task. Use when implementing or fixing work under .cursor/loops/ and before declaring the loop complete. Never hand back partially verified work.
tags:
  - agentic_ai
  - agents
  - documentation
  - loops
---

# Loop verification skill

The **hard gate** for agent loops is `loop.json` → `verify` (shell exit `0`). This skill
documents *how* to run checks with the same discipline as a human QA pass: quantitative,
repeatable, no partial handoff.

## Rules

1. **Verifier wins** — success is exit `0` from `verify` / `finalVerify`, not your assessment.
2. **Fail → fix → rerun** — if any step fails, fix the code and rerun from step 1.
3. **No partial handoff** — do not stop after "mostly works" or "tests should pass".
4. **Stay in scope** — only run checks listed here and in `GOAL.md` acceptance criteria.

## Before you start

- Read `GOAL.md` in the loop directory (frozen spec).
- Confirm `loop.json` `verify` points at `verify.sh` (or your project command).
- If the loop has a Taskwarrior UUID in `GOAL.md` / `loop.json`, cite it in commit
  messages (`task <uuid>`) — numeric IDs are recycled; **UUID is the stable key**.

## Checklist (customize per loop)

Replace placeholders with commands that match **this** loop's acceptance criteria.

### Step 1 — Fast unit / guard

```bash
# Example — adjust path and runner:
pnpm vitest run path/to/feature.test.ts
```

**Pass when:** exit `0`, no skipped assertions that matter for the goal.

### Step 2 — Typecheck / build (if applicable)

```bash
pnpm exec tsc --noEmit
# or: pnpm run build
```

**Pass when:** exit `0`.

### Step 3 — Integration / smoke (optional)

```bash
# Example: curl local endpoint, run e2e slice, grep log for expected string
```

**Pass when:** observable output matches GOAL acceptance criteria.

### Step 4 — Run the loop verifier

From the **repository root** (same cwd Agent Looper uses):

```bash
bash .cursor/loops/<loop-name>/verify.sh
# or the exact command from loop.json "verify"
```

**Pass when:** exit `0`. This is what the harness runs every iteration.

## `finalVerify` (stricter outer gate)

When `loop.json` sets `finalVerify`, run it after inner `verify` passes — e.g. deploy +
smoke on staging. Document those steps here or in a sibling `FINAL-VERIFY.skill.md`.

## Wiring

| Artifact | Purpose |
| --- | --- |
| `GOAL.md` | Frozen spec + acceptance criteria |
| `loop.json` → `verify` | Shell command the harness runs (usually `verify.sh`) |
| `verify.sh` | Executable checklist (this skill's commands) |
| `VERIFY.skill.md` | Human/agent-readable procedure (this file) |
| `loop.json` → `taskwarriorUuid` | Auto-complete TW task on success — **UUID only** |

## Anti-patterns

- Replacing `verify` with "I read the code and it looks correct."
- Removing or weakening a failing check to get green.
- Editing `GOAL.md` mid-loop to shrink scope.

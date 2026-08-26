---
tags:
  - documentation
  - loops
  - verification
  - agentic_ai
  - agents
---
# Verification-as-skill

Track **A** of roadmap milestone **M4** ([`loop-review-roadmap.md`](./loop-review-roadmap.md)).
Taskwarrior: `fe3f4076-b997-4d28-a59a-baf720c28e5d` (project `agent-loop`).

## Why

`loop.json` `verify` is a shell command (exit `0` = done). The highest-leverage quality
move is to make that command wrap a **quantitative checklist** — same steps every
iteration, no "looks good" handoff.

The harness does **not** run agent skills as `verify` by default. Set `verifyMode: "skill"`
when you want Track B (see [Track B](#track-b-verifymode-skill) below). Today you wire:

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

### Verify log mode (optional)

Default is **`inline`**: the next worker prompt includes the captured verify stdout/stderr. Omit the field unless you need the other mode.

Set `"verifyLogMode": "sidecar"` when verify is noisy (full-suite dumps, Playwright traces, compiler walls). The harness writes `<loop-dir>/verify-logs/iter-N.{verify,final}.{stdout,stderr}.txt` and puts a ~600-character preview plus path in the prompt. The worker can `Read` the file if the preview is not enough. Sidecar does not change pass/fail; the shell capture is still capped (~64KB) before write.

Keep `inline` when `verify.sh` prints a few lines — then the extra file hop is only friction.

## Authoring verify.sh

- `set -euo pipefail` at the top.
- Echo `[verify] step N` before each check (shows up in loop logs).
- Prefer **narrow** commands (one test file, one script) over whole-suite runs when
  iterating — keep `finalVerify` for the heavy path.
- Exit non-zero on any failed assertion; the loop will not complete.
- Metric loops (lower-is-better): pair with [`templates/verify.metric.example.sh`](../templates/verify.metric.example.sh).
  Set `BASELINE_MS` so a result **worse than baseline** fails (revert signal) even if
  you have not hit the threshold yet. See [`templates/GOAL.metric.template.md`](../templates/GOAL.metric.template.md).

## GOAL.md tips

Name a **four-part finish line** before freeze (see [`templates/GOAL.template.md`](../templates/GOAL.template.md)):

| Part | Where |
| --- | --- |
| Outcome | Goal paragraph |
| Scoreboard | `verify.sh` exit `0` |
| Permission | `loop.json` `maxIterations` / `stagnationThreshold` |
| Budget | stop when further work is not worth it — not "until perfect" |

Optional **Golden**: path to a screenshot, fixture, or baseline the critic / verify holds against. Visual / taste loops: [`templates/GOAL.visual.template.md`](../templates/GOAL.visual.template.md). Optional brownfield **Research**: [`templates/RESEARCH.example.md`](../templates/RESEARCH.example.md) beside GOAL (indexed in the worker prompt).

Under **Acceptance criteria**, link the verifier explicitly:

```markdown
- Success is determined **only** by `loop.json` `verify` (exit `0`).
- Measurable checks live in `verify.sh` and `VERIFY.skill.md`.
```

Metric grind: if measured is worse than the recorded baseline, that is a **revert**, not a candidate to keep.

Preflight warns when GOAL.md does not mention measurable verify artifacts.

## Track B (`verifyMode: skill`)

Optional harness mode — default remains **`command`** (shell only).

```json
{
  "verify": "bash .cursor/loops/my-task/verify.sh",
  "verifyMode": "skill",
  "verifySkill": ".cursor/loops/my-task/VERIFY.skill.md"
}
```

| Field | Default | Meaning |
| --- | --- | --- |
| `verifyMode` | `"command"` | `"command"` → shell `verify` only; `"skill"` → agent verify pass then shell |
| `verifySkill` | — | Path to `VERIFY.skill.md` (required when `verifyMode` is `"skill"`). Resolved relative to the loop directory, then repo root. |
| `verify` | required | Shell gate after skill PASS. Prefer a real `verify.sh`. `"true"` is allowed as a noop but doctor/`loadLoopBundle` will warn it is trivial. |

### Hybrid dynamic verify (optional pattern)

Keep a **fixed floor** in `verify.sh` (always runs). For this-change edge cases:

1. Human / review lists cases worth exercising.
2. Worker or verify-skill may add ephemeral checks (script snippets, extra greps).
3. Shell still decides — never treat agent PASS alone as completion.

See also [`docs/unknowns-preflight.md`](./unknowns-preflight.md) and intervention modes in `templates/REVIEWS.md`.

### AI-assisted extras (optional)

When the worker may add dependencies or touch credential-shaped files, layer
model-failure checks **on top of** the fixed floor — still shell exit codes:

- Secret scan (gitleaks / focused `rg`)
- Hallucinated-dependency / lockfile drift (slopsquatting)
- Block non-registry installs (`git+`, raw URLs) in the diff

Scaffold: [`templates/verify.ai-assisted.example.sh`](../templates/verify.ai-assisted.example.sh).
Policy rows: [`templates/LOOP.permissions.example.md`](../templates/LOOP.permissions.example.md).
These are outside the model (same instinct as NeMo/CI gates): the judge does not
replace them.

## Visible UI / computer-use (template-only)

Default loops stay **headless** — shell `verify` only. When the product under test
needs UI drive (Playwright, screenshot diff, Cursor computer-use), copy:

- [`templates/GOAL.computer-use.template.md`](../templates/GOAL.computer-use.template.md)
- [`templates/verify.computer-use.example.sh`](../templates/verify.computer-use.example.sh)

Pattern: a **shell floor** always runs in CI; optional UI hooks activate with
`RUN_UI=1` locally. The harness does not ship Playwright or computer-use runtime —
consumers wire their driver beside `verify.sh`. Dogfood loop:
`.cursor/loops/computer-use-verify-example`.

### Skill verify flow

1. Fresh agent session with `phase: 'verify'` (same `resolveIterationAgent` as the worker for this iteration — `reasoningEffort` ladder and `escalateModel` apply).
2. Prompt = `VERIFY.skill.md` body + `GOAL.md` acceptance criteria.
3. Agent must end with **`VERIFY_RESULT: PASS`** or **`VERIFY_RESULT: FAIL`** (last footer wins).
4. On **FAIL** or missing footer → iteration fails (shell `verify` is **not** run).
5. On **PASS** → run shell `verify` (same as command mode). Exit `0` still wins.

Cline runtimes load `@cline/sdk` via dynamic import (Cursor-only installs stay safe).

## Related tasks (UUIDs)

| Milestone | UUID | Summary |
| --- | --- | --- |
| M1 | `8162dbe4-9a2d-4fc4-92d4-fd06a6e9dea6` | Impact-severity contract |
| M2 | `b2185d70-2889-4eed-94c2-d99949954211` | Reproduce-before-report |
| M3 | `adf66bf8-d52a-43e2-8009-756649cc32b2` | Multi-family review judge |
| M4 | `fe3f4076-b997-4d28-a59a-baf720c28e5d` | Verification-as-skill (this doc) |
| M5 | `06dec3c5-b35d-4e8a-bb95-c0f2a9ae4f00` | Cross-loop meta-review CLI |

---
tags:
  - documentation
  - agents
  - loops
---
# TW — Verification-as-skill Track B (`verifyMode`)

**UUID:** `fe3f4076-b997-4d28-a59a-baf720c28e5d`

## Goal

Add optional **`verifyMode`** to the harness so loops can run verification as either
a shell command (today) or an **agent skill pass** (Track B).

```text
verifyMode: command → runVerifyCommand (unchanged)
verifyMode: skill    → Cursor/Cline agent reads verifySkill → PASS/FAIL
```

Track A (templates + `verify.sh` beside each loop) is already shipped — wire the
harness without breaking existing consumers.

## Acceptance criteria

Success is determined **only** by `loop.json` `verify` (exit `0`). Checks live in
`verify.sh` / `VERIFY.skill.md`.

- Config in `loop.json` (defaults preserve today):
  - `verifyMode?: 'command' | 'skill'` — default `'command'`
  - `verifySkill?: string` — path to `VERIFY.skill.md` (required when `verifyMode` is
    `'skill'`); relative to loop dir or repo root
  - `verify` remains required (shell fallback / inner gate for skill mode — document:
    skill mode runs agent first; on agent PASS, still run `verify` shell unless
    `verify` is `true` / noop — **or** skill-only path exits 0 when agent reports
    PASS with structured footer; pick one, test it, document in
    `docs/verification-as-skill.md`)
- **Skill verify:** fresh agent session (`phase: 'verify'`), prompt includes skill
  body + GOAL acceptance criteria; agent must end with structured line
  `VERIFY_RESULT: PASS` or `VERIFY_RESULT: FAIL` (parse deterministically).
- **Cursor-only safe:** dynamic import for Cline verify runner (same pattern as
  secondary review); default installs never load `@cline/sdk` when unused.
- `agentLoop` logs `verify mode: command|skill` on stderr; skill failures surface
  in verify stderr like shell failures.
- Unit tests mock agent runner — no live SDK in CI.
- Update `docs/verification-as-skill.md` Track B section + roadmap checkbox.

## Constraints

- Scope: `src/loop/loopVerify*.ts`, `loopConfig`, `agentLoop`, `loopAgentConfig` if
  needed, tests, docs.
- Do **not** edit this `GOAL.md` mid-loop.
- Do not change review pipeline (M2/M3/M5).
- Keep `verify` string required for backward compat (skill mode may use it as
  post-skill shell gate or `true` noop — document choice).

## Out of scope

- Replacing shell verify entirely for all loops by default
- Running unified-code-review as verify
- Meta-review CLI changes

## References

- `docs/verification-as-skill.md`
- `docs/loop-review-roadmap.md` §4 Track B
- `templates/VERIFY.skill.md`
- `src/loop/loopVerify.ts`
- Taskwarrior: `fe3f4076-b997-4d28-a59a-baf720c28e5d`

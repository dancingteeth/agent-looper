---
tags:
  - documentation
  - agents
  - loops
---
# cli-setup-wizard — Agent Looper setup wizard CLI

## Finish line (four parts)

| Part | Where | This loop |
| --- | --- | --- |
| **Outcome** | Goal | `src/cli/setup.ts` → `dist/cli/setup.js`, bin `agent-loop-setup`, schema-valid wizard |
| **Scoreboard** | `verify.sh` (exit `0`) | Six checks: help, dsh fixture, notify fixture, rejections, printed run commands |
| **Permission** | `loop.json` | `maxIterations` 8 / `stagnationThreshold` 3 |
| **Budget** | below | Stop when verify is green. Do not polish interactive copy past that. |

## Goal

Build a CLI setup wizard for Agent Looper as a new CLI entry **in this checkout**
(repo root = this workspace; overridable via `AGENT_LOOP_REPO` only for the
verifier): source `src/cli/setup.ts` compiled to `dist/cli/setup.js`, registered
in `package.json` `bin` as `agent-loop-setup` — mirroring `agent-loop-init`
(`src/cli/init.ts` → `dist/cli/init.js`).

This workspace **is** the agent-loop repo. Write the files here. Do not stage a
`deploy/` tree in another project, and do not treat a sibling copy as the
canonical deliverable.

The wizard is an interactive walkthrough that writes a valid `loop.json` for a
new loop bundle (and optionally patches `.cursor/agent-loop.repo.json`), then
prints the `agent-check <runtime>` and `agent-loop run <loop-dir>` commands
(plus `--review-runtime <rt>` when a review runtime is set). It must support a
**non-interactive answers mode** so the verifier can drive it deterministically:
`node dist/cli/setup.js --answers <answers.json> --out <loop-dir>`, where
`--answers` is a JSON object mirroring `loop.json` fields (plus an optional
`"profile": {…}` object for repo-profile patches) and `--out` is the directory
where `loop.json` is written (default: cwd).

All field names, enums, and defaults come from the **real schema**: import
`loopConfigSchema` / `repoProfileSchema` / `parseLoopConfig` from this repo.
Do not invent fields.

## Wizard steps (in scope — GOAL.md lists all of these as required features)

1. **Worker runtime**: `cursor | cline-pass | cline | opencode | pi | codex | dsh`
   plus `model` / `escalateModel` / `escalateAfterStagnation`, and Cline-only
   `reasoningEffort` / `escalateReasoningEffort` prompts (skipped for cursor/dsh).
2. **Judge**: `reviewRuntime` + `reviewModel` — omitting `reviewModel` takes
   runtime defaults: cursor → `grok-4.6` when worker is cursor else
   `composer-2.5`; opencode → `opencode-go/deepseek-v4-pro`; dsh →
   `deepseek-official/deepseek-v4-pro`; codex → `gpt-5.6-sol`. Plus
   `reviewGate` / `maxReviewCycles` / `postQualityReview` / `reviewRisk` and
   optional `reviewSecondaryRuntime` (only `cline-pass` | `cline`).
3. **Verify**: verify command, `verifyMode` `command|skill`, optional
   `verifySkill` / `finalVerify`.
4. **Loop control**: `maxIterations`, `stagnationThreshold`, `mode`
   `forward|reverse`, `pauseAfterIteration`, `trustConfig`.
5. **Notify / Telegram** (loop.json + profile `telegramNotify`):
   `notifyTelegram`, `telegramAttachReview`, `requireNotify`, `notifyCommand`;
   profile `telegramNotify.chatId` / `onSuccess` / `onFailure` / `attachReview`.
   The Telegram token stays in env — the wizard never reads or prints secrets.
6. **Git / PR / completion**: profile `defaultBranch` (diff base);
   `notifyPrComment` (`gh pr comment` on open PR / `AGENT_LOOP_PR_NUMBER`);
   `completionSignal` (`AGENT_LOOP_DONE` on stdout); `exportPack` /
   `exportRunReport` / `exportTranscript`; `syncOnSuccess` (repo `syncCommand`).
7. **HITL**: `hitlProvider`, `hitlOnFailure`, `reviewGateHitl`,
   `taskwarriorUuid` (UUID only — never a numeric ID).
8. **Print** after writing: `agent-check <runtime>` and
   `agent-loop run <loop-dir>` (plus `--review-runtime` when reviewRuntime set).

## Budget

- Stop when `verify.sh` exits 0.
- Do not keep iterating on wording, extra prompts, or unused flags after green.
- Do **not** set permission to "until perfect".

## Acceptance criteria

Success is determined **only** by the verifier (`verify.sh`), not by your own
assessment. The verifier locates this checkout (`AGENT_LOOP_REPO`, default: the
repo that contains this loop bundle), builds it if `dist/cli/setup.js` is
missing, and exits 0 only when **all** of the following pass:

1. `--help` lists runtimes including `dsh` and review/notify/git flags or prompts
   (invoked as `node dist/cli/setup.js --help`).
2. A fixture walk (`--answers` + `--out` into a temp dir) writes a `loop.json`
   that the real `loopConfigSchema.parse` accepts (validated by importing
   `parseLoopConfig` from `dist/loop/loopConfig.js`, which accepts `dsh`).
3. At least one fixture sets `runtime: "dsh"` + `reviewRuntime: "dsh"` **without**
   `reviewModel`, and the written `loop.json` matches exactly (no `reviewModel` key).
4. At least one fixture sets `notifyTelegram: false` or `notifyPrComment: true`,
   and the written `loop.json` matches that value.
5. The wizard rejects an unknown runtime (e.g. `runtime: "banana"`) and rejects
   Fast cursor review models (e.g. `reviewRuntime: "cursor"` with a
   `composer-fast` / `grok-4.6-fast` style `reviewModel`) — non-zero exit, no
   `loop.json` written.
6. The fixture-walk stdout prints `agent-check` and `agent-loop run` (the run
   command from step 8).

The verifier must not use `true` or empty checks for any of the above.

## Constraints

- Implement **in this checkout**: `src/cli/setup.ts` → `dist/cli/setup.js`, bin
  `agent-loop-setup`, mirroring `agent-loop-init`.
- Every field the wizard can emit must exist in the real `loopConfigSchema` /
  `repoProfileSchema` — no invented fields, no hardcoded model lists that
  contradict the schema's runtime defaults (dsh worker default
  `deepseek-official/deepseek-v4-flash`, judge default
  `deepseek-official/deepseek-v4-pro`).
- Do not edit `GOAL.md`, `loop.json`, `verify.sh`, or `SPEC.md` during the loop.
- Do not dump secrets (Telegram token, Doppler, auth files). The token stays in
  env; the wizard only writes config values.
- Keep the wizard dependency-light: use this repo's existing deps (zod via
  `loopConfigSchema`) and node builtins; no new runtime deps unless necessary
  for the walkthrough.

## Out of scope

- Implementing `smokeScripts` / `siblingRepos` / `verifyPreflight` (reserved,
  not executed).
- DSH `/loop` and `/goal` are a different product — not the finish line.
- Publishing, versioning, or releasing the agent-looper package.
- Changing the auth flow, middleware, or any existing agent-loop behavior.

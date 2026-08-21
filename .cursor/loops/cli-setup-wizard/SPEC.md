# cli-setup-wizard — canonical design spec

A CLI setup wizard for Agent Looper (`@dancingteeth/agent-looper`). Interactive
walkthrough that writes a valid `loop.json` (and optional
`.cursor/agent-loop.repo.json` patches), then prints `agent-check` + run commands.

This loop is frozen **in the agent-loop checkout**. The wizard source lands at
`src/cli/setup.ts` here. Use the real schema in `src/loop/loopConfig.ts` and
`src/context/repoProfile.ts`. Do not invent fields.

## Wizard steps (in scope)

1. Worker runtime: `cursor | cline-pass | cline | opencode | pi | codex | dsh`
   + `model` / `escalateModel` / `escalateAfterStagnation`
   + Cline-only `reasoningEffort` / `escalateReasoningEffort` (skip for cursor/dsh)
2. Judge: `reviewRuntime` + `reviewModel` (omit model to take runtime defaults:
   cursor → `grok-4.6` when worker is cursor else `composer-2.5`;
   opencode → `opencode-go/deepseek-v4-pro`;
   dsh → `deepseek-official/deepseek-v4-pro`;
   codex → `gpt-5.6-sol`)
   + `reviewGate` / `maxReviewCycles` / `postQualityReview` / `reviewRisk`
   + optional `reviewSecondaryRuntime` (cline-pass | cline only)
3. Verify: verify command, `verifyMode` command|skill, optional `verifySkill` / `finalVerify`
4. Loop control: `maxIterations`, `stagnationThreshold`, `mode` forward|reverse,
   `pauseAfterIteration`, `trustConfig`
5. Notify / Telegram (loop.json + profile telegramNotify):
   `notifyTelegram`, `telegramAttachReview`, `requireNotify`, `notifyCommand`
   profile: `telegramNotify.chatId`, `onSuccess`, `onFailure`, `attachReview`
   (token stays in env — wizard never cats secrets)
6. Git / PR / completion:
   profile `defaultBranch` (diff base)
   `notifyPrComment` (`gh pr comment` on open PR / AGENT_LOOP_PR_NUMBER)
   `completionSignal` (AGENT_LOOP_DONE on stdout)
   `exportPack` / `exportRunReport` / `exportTranscript`
   `syncOnSuccess` (repo `syncCommand`)
7. HITL: `hitlProvider`, `hitlOnFailure`, `reviewGateHitl`, `taskwarriorUuid`
   (UUID only, never numeric ID)
8. Print: `agent-check <runtime>` and `agent-loop run <loop-dir>` (plus
   `--review-runtime` if set)

## Out of scope

- Implementing `smokeScripts` / `siblingRepos` / `verifyPreflight` (reserved, not executed)
- DSH `/loop` and `/goal` are not the finish line.
- Staging the wizard in another repo (`deploy/` sidecars) instead of writing `src/cli/setup.ts` here.

## verify.sh (measurable — name exact steps in GOAL.md)

After the grind implements `src/cli/setup.ts` (bin `agent-loop-setup`):

- `--help` lists runtimes including dsh and review/notify/git flags or prompts
- A fixture walk writes `loop.json` that `loopConfigSchema.parse` accepts
- At least one fixture sets `runtime`+`reviewRuntime` dsh without `reviewModel`
- At least one fixture sets `notifyTelegram` false or `notifyPrComment` true and the written JSON matches
- Reject unknown runtime / Fast cursor review models
- Do not use `true` or empty checks as verify

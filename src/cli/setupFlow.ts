import path from 'node:path'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'
import {
  HITL_PROVIDER_CHOICES,
  JUDGE_RUNTIME_CHOICES,
  MENU_CUSTOM,
  MENU_OMIT,
  REASONING_EFFORT_CHOICES,
  WORKER_RUNTIME_CHOICES,
  escalateAfterChoices,
  escalateModelChoices,
  judgeModelChoices,
  maxIterationsChoices,
  maxReviewCyclesChoices,
  stagnationChoices,
  workerModelChoices,
  yesNoChoices,
  type MenuChoice,
} from './setupMenus.js'

export type SetupPrompts = {
  select: (
    heading: string,
    blurb: string,
    choices: readonly MenuChoice[],
    defaultValue: string,
  ) => Promise<string>
  text: (prompt: string, dflt?: string) => Promise<string>
}

export async function collectSetupAnswers(
  prompts: SetupPrompts,
  outDir: string,
): Promise<Record<string, unknown>> {
  const answers: Record<string, unknown> = {}
  const profile: Record<string, unknown> = {}
  const askSelect = prompts.select
  const askText = prompts.text
  const askBool = async (
    heading: string,
    blurb: string,
    dflt: boolean,
    yes: string,
    no: string,
  ): Promise<boolean> => {
    const value = await askSelect(heading, blurb, yesNoChoices(yes, no), dflt ? 'y' : 'n')
    return value === 'y'
  }
  const askOptionalSlug = async (
    heading: string,
    blurb: string,
    choices: readonly MenuChoice[],
    customPrompt: string,
  ): Promise<string | undefined> => {
    const picked = await askSelect(heading, blurb, choices, MENU_OMIT)
    if (picked === MENU_OMIT) return undefined
    if (picked === MENU_CUSTOM) {
      const custom = await askText(customPrompt)
      return custom === '' ? undefined : custom
    }
    return picked
  }

  const runtime = await askSelect(
    'Worker runtime',
    'The SDK/CLI that implements GOAL.md each iteration. This is not the judge.',
    WORKER_RUNTIME_CHOICES,
    LOOP_RUNTIME_CURSOR,
  )
  answers.runtime = runtime
  const workerRuntime = runtime as LoopRuntime

  const model = await askOptionalSlug(
    'Worker model',
    'Catalog is scoped to the worker runtime you just picked. Prefer omit unless you need a non-default slug.',
    workerModelChoices(workerRuntime),
    'Custom worker model slug',
  )
  if (model !== undefined) answers.model = model

  if (runtime !== LOOP_RUNTIME_CURSOR) {
    const escalateModel = await askOptionalSlug(
      'Escalate model',
      'Used after N identical verify failures (escalateAfterStagnation). Omit to take the runtime escalate default.',
      escalateModelChoices(workerRuntime),
      'Custom escalate model slug',
    )
    if (escalateModel !== undefined) answers.escalateModel = escalateModel
  }
  answers.escalateAfterStagnation = Number(
    await askSelect(
      'Escalate after N identical failures',
      'How many identical verify failures before switching to escalateModel (after reasoning-effort ceiling).',
      escalateAfterChoices(),
      '2',
    ),
  )

  if (runtime === LOOP_RUNTIME_CLINE_PASS || runtime === LOOP_RUNTIME_CLINE) {
    const effort = await askSelect(
      'Cline reasoning effort',
      'Cline SDK only. Skip-equivalent is "none" (field omitted).',
      REASONING_EFFORT_CHOICES,
      'none',
    )
    if (effort !== 'none') answers.reasoningEffort = effort
    const escalateEffort = await askSelect(
      'Cline escalate reasoning effort',
      'Raised before a model switch when Cline is the worker.',
      REASONING_EFFORT_CHOICES,
      'none',
    )
    if (escalateEffort !== 'none') answers.escalateReasoningEffort = escalateEffort
  }

  const reviewRuntime = await askSelect(
    'Judge runtime (reviewRuntime)',
    'Who writes residual quality review.md. Not the worker. Pick DeepSeek Harness (dsh) if the judge should be headless DSH — do not type a model slug.',
    JUDGE_RUNTIME_CHOICES,
    LOOP_RUNTIME_CURSOR,
  )
  answers.reviewRuntime = reviewRuntime
  const reviewModel = await askOptionalSlug(
    'Judge model (reviewModel)',
    `Allowed slugs for reviewRuntime="${reviewRuntime}" only. Prefer omit so the schema default applies (DeepSeek Harness → V4 Pro, Cursor worker → grok-4.6).`,
    judgeModelChoices(reviewRuntime as LoopRuntime, workerRuntime),
    'Custom judge model slug',
  )
  if (reviewModel !== undefined) answers.reviewModel = reviewModel
  answers.reviewGate = await askBool(
    'Enable review gate (reviewGate)',
    'When on, a deny/guide verdict can trigger another implement cycle. Shell verify is still the exit.',
    false,
    'Block or continue from residual review (Proceed / Guide / Deny). Costs extra judge runs.',
    'Off. One post-loop review at most; verify.sh still decides green.',
  )
  answers.maxReviewCycles = Number(
    await askSelect(
      'Max review cycles (maxReviewCycles)',
      'Cap on review-triggered fix rounds. Ignored when reviewGate is off.',
      maxReviewCyclesChoices(),
      '2',
    ),
  )
  const pqr = await askSelect(
    'Post-quality review',
    'Whether to run a residual quality review after verify. auto follows reviewRisk.',
    [
      {
        value: 'auto',
        title: 'auto',
        description: 'Default. Run residual review when reviewRisk is not low.',
      },
      {
        value: 'true',
        title: 'always',
        description: 'Always run residual review (still does not replace verify.sh).',
      },
      {
        value: 'false',
        title: 'never',
        description: 'Skip residual review. Use for cheap smoke loops.',
      },
    ],
    'auto',
  )
  if (pqr === 'true') answers.postQualityReview = true
  else if (pqr === 'false') answers.postQualityReview = false
  else answers.postQualityReview = 'auto'
  answers.reviewRisk = await askSelect(
    'Review risk',
    'How hard the residual judge should look. auto lets the harness pick from the diff.',
    [
      {
        value: 'auto',
        title: 'auto',
        description: 'Default. Harness infers risk from the change.',
      },
      {
        value: 'high',
        title: 'high',
        description: 'Auth, money, data, or loop-harness changes. Stricter residual bar.',
      },
      {
        value: 'medium',
        title: 'medium',
        description: 'Normal product change.',
      },
      {
        value: 'low',
        title: 'low',
        description: 'Docs/copy/tests-only. Often skips residual review under auto.',
      },
    ],
    'auto',
  )
  const secondary = await askSelect(
    'Secondary review runtime',
    'Optional second residual pass (Cline only). none is the usual choice.',
    [
      {
        value: 'none',
        title: 'none',
        description: 'Default. One judge runtime is enough.',
      },
      {
        value: 'cline-pass',
        title: 'cline-pass',
        description: 'Second residual review on Cline Pass quota.',
      },
      {
        value: 'cline',
        title: 'cline',
        description: 'Second residual review on Cline credits.',
      },
    ],
    'none',
  )
  if (secondary !== 'none') answers.reviewSecondaryRuntime = secondary

  const suggestedVerify = `bash ${path.join(outDir, 'verify.sh')}`
  const verifyPick = await askSelect(
    'Verify command',
    'Measurable exit 0/1 scoreboard. Required. Prefer a bundle verify.sh over ad-hoc one-liners.',
    [
      {
        value: suggestedVerify,
        title: suggestedVerify,
        description: 'Default path from --out. You still need to write that script (wizard does not).',
      },
      {
        value: MENU_CUSTOM,
        title: 'Custom command',
        description: 'Type a shell command next. Must be non-empty.',
      },
    ],
    suggestedVerify,
  )
  answers.verify =
    verifyPick === MENU_CUSTOM
      ? (await askText('Custom verify command (required)')).trim() || suggestedVerify
      : verifyPick
  const verifyMode = await askSelect(
    'Verify mode',
    'command runs verify as a shell command. skill loads VERIFY.skill.md as the worker runbook plus the command.',
    [
      {
        value: 'command',
        title: 'command',
        description: 'Default. Harness runs the verify field as a shell command.',
      },
      {
        value: 'skill',
        title: 'skill',
        description: 'Also inject VERIFY.skill.md. Still needs a verify command that exits 0/1.',
      },
    ],
    'command',
  )
  answers.verifyMode = verifyMode
  if (verifyMode === 'skill') {
    const skillPick = await askSelect(
      'Verify skill path',
      'Relative to the loop bundle unless absolute.',
      [
        {
          value: 'VERIFY.skill.md',
          title: 'VERIFY.skill.md',
          description: 'Convention: sit beside loop.json / verify.sh.',
        },
        {
          value: MENU_CUSTOM,
          title: 'Custom path',
          description: 'Type a path next.',
        },
        {
          value: MENU_OMIT,
          title: 'Omit (schema default)',
          description: 'Do not write verifySkill; harness default applies.',
        },
      ],
      'VERIFY.skill.md',
    )
    if (skillPick === MENU_CUSTOM) {
      const customSkill = await askText('Custom verifySkill path')
      if (customSkill !== '') answers.verifySkill = customSkill
    } else if (skillPick !== MENU_OMIT) {
      answers.verifySkill = skillPick
    }
  }
  const finalVerifyPick = await askSelect(
    'Final verify command',
    'Optional extra check after the last iteration (e.g. a slower suite). Omit unless you have one.',
    [
      {
        value: MENU_OMIT,
        title: 'None',
        description: 'Default. One verify command is enough.',
      },
      {
        value: MENU_CUSTOM,
        title: 'Custom command',
        description: 'Type a command next.',
      },
    ],
    MENU_OMIT,
  )
  if (finalVerifyPick === MENU_CUSTOM) {
    const finalVerify = await askText('Final verify command')
    if (finalVerify !== '') answers.finalVerify = finalVerify
  }

  answers.maxIterations = Number(
    await askSelect(
      'Max iterations',
      'Hard cap. Stop at green verify; do not grind to this number.',
      maxIterationsChoices(),
      '8',
    ),
  )
  answers.stagnationThreshold = Number(
    await askSelect(
      'Stagnation threshold',
      'Abort after this many identical verify failures.',
      stagnationChoices(),
      '3',
    ),
  )
  answers.mode = await askSelect(
    'Loop mode',
    'forward implements then verifies. reverse starts from a failing verify (repair).',
    [
      {
        value: 'forward',
        title: 'forward',
        description: 'Default. Implement → verify until green or budget.',
      },
      {
        value: 'reverse',
        title: 'reverse',
        description: 'Start from a red verify and repair.',
      },
    ],
    'forward',
  )
  answers.pauseAfterIteration = await askBool(
    'Pause after each iteration',
    'Stop between iterations so a human can inspect the tree.',
    false,
    'Pause. You resume the loop manually.',
    'No pause. Unattended grind (default).',
  )
  answers.trustConfig = await askBool(
    'Trust this loop.json (trustConfig)',
    'When true, skip some untrusted-config warnings for this bundle.',
    false,
    'Mark this loop.json as trusted on this machine.',
    'Leave untrusted (default). Safer for copied bundles.',
  )

  answers.notifyTelegram = await askBool(
    'Send completion report to Telegram',
    'Uses TELEGRAM_BOT_TOKEN from the environment. The wizard never prints or stores the token.',
    true,
    'Send the completion report (default).',
    'Do not send Telegram on exit.',
  )
  answers.telegramAttachReview = await askBool(
    'Attach latest review.md to Telegram',
    'Only if a residual review file exists.',
    true,
    'Attach review.md when present (default).',
    'Text-only Telegram message.',
  )
  answers.requireNotify = await askBool(
    'Abort if Telegram preflight fails (requireNotify)',
    'When on, a missing token/chatId fails the loop instead of skipping notify.',
    false,
    'Fail the run if Telegram cannot send.',
    'Warn and continue if notify is not configured (default).',
  )
  const notifyCommandPick = await askSelect(
    'Custom notifyCommand',
    'Optional shell command instead of the built-in Telegram sender.',
    [
      {
        value: MENU_OMIT,
        title: 'None (built-in Telegram)',
        description: 'Default. Use loop.json notifyTelegram + env token.',
      },
      {
        value: MENU_CUSTOM,
        title: 'Custom command',
        description: 'Type a command next.',
      },
    ],
    MENU_OMIT,
  )
  if (notifyCommandPick === MENU_CUSTOM) {
    const notifyCommand = await askText('Custom notifyCommand')
    if (notifyCommand !== '') answers.notifyCommand = notifyCommand
  }
  const telegram: Record<string, unknown> = {}
  const chatIdPick = await askSelect(
    'Telegram chatId',
    'Numeric chat id for profile telegramNotify.chatId. Token stays in env.',
    [
      {
        value: MENU_OMIT,
        title: 'Skip (use existing profile / env)',
        description: 'Do not patch chatId. Keep whatever is already in .cursor/agent-loop.repo.json.',
      },
      {
        value: MENU_CUSTOM,
        title: 'Set chatId',
        description: 'Type the numeric chat id next (e.g. 123456789).',
      },
    ],
    MENU_OMIT,
  )
  if (chatIdPick === MENU_CUSTOM) {
    const chatId = await askText('Telegram chatId')
    if (chatId !== '') telegram.chatId = chatId
  }
  telegram.onSuccess = await askBool(
    'Telegram notify on success',
    'Send when the loop exits complete.',
    true,
    'Notify on success (default).',
    'Skip success messages.',
  )
  telegram.onFailure = await askBool(
    'Telegram notify on failure',
    'Send when the loop exits incomplete / error.',
    true,
    'Notify on failure (default).',
    'Skip failure messages.',
  )
  telegram.attachReview = await askBool(
    'Telegram attach review (profile)',
    'Repo-profile default for attaching review.md. Loop json telegramAttachReview can still override.',
    true,
    'Attach review.md at the profile layer (default).',
    'Do not attach from the profile default.',
  )
  profile.telegramNotify = telegram

  const defaultBranch = await askSelect(
    'Repo default branch (diff base)',
    'profile defaultBranch — merge-base for diffs and some git helpers.',
    [
      { value: 'main', title: 'main', description: 'Default. Most repos.' },
      { value: 'master', title: 'master', description: 'Legacy default branch name.' },
      {
        value: MENU_CUSTOM,
        title: 'Custom branch name',
        description: 'Type the branch next (e.g. trunk).',
      },
    ],
    'main',
  )
  profile.defaultBranch =
    defaultBranch === MENU_CUSTOM ? await askText('Default branch name', 'main') : defaultBranch
  answers.notifyPrComment = await askBool(
    'Comment on open PR after exit (notifyPrComment)',
    'gh pr comment on the open PR / AGENT_LOOP_PR_NUMBER.',
    false,
    'Post a completion comment on the PR.',
    'Do not comment on a PR (default).',
  )
  answers.completionSignal = await askBool(
    'Emit AGENT_LOOP_DONE on stdout',
    'Machine-readable completion line for wrappers.',
    true,
    'Print AGENT_LOOP_DONE (default).',
    'Stay quiet on stdout besides logs.',
  )
  answers.exportPack = await askBool(
    'Export artifacts to .cursor/loop-exports',
    'Copy summary / report / log tail out of temp run dirs.',
    true,
    'Export a pack (default).',
    'Skip the export pack.',
  )
  answers.exportRunReport = await askBool(
    'Write run-report.md',
    'Human-readable grind summary in the export pack / run dir.',
    true,
    'Write run-report.md (default).',
    'Skip the markdown report.',
  )
  answers.exportTranscript = await askBool(
    'Record transcript.ndjson',
    'JSONL of worker/judge turns. Useful for debugging; can be large.',
    true,
    'Record transcript.ndjson (default).',
    'Skip the transcript.',
  )
  answers.syncOnSuccess = await askBool(
    'Run profile syncCommand after success',
    'If .cursor/agent-loop.repo.json defines syncCommand, run it after a green exit.',
    true,
    'Run syncCommand on success (default).',
    'Skip syncCommand.',
  )

  answers.hitlProvider = await askSelect(
    'HITL provider',
    'Where to open a human checkpoint if the loop is incomplete or the review gate is exhausted.',
    HITL_PROVIDER_CHOICES,
    'taskwarrior',
  )
  answers.hitlOnFailure = await askBool(
    'Open HITL checkpoint on incomplete loop',
    'When the grind stops without complete:true.',
    false,
    'Open a HITL task/issue on incomplete.',
    'Do not open HITL on incomplete (default).',
  )
  answers.reviewGateHitl = await askBool(
    'Escalate exhausted review gate to a human',
    'When reviewGate burns maxReviewCycles without Proceed.',
    false,
    'Open HITL after the gate is exhausted.',
    'Do not escalate the gate to a human (default).',
  )
  const uuidPick = await askSelect(
    'Taskwarrior UUID',
    'Optional loop.json taskwarriorUuid. UUID only — never a numeric Taskwarrior ID.',
    [
      {
        value: MENU_OMIT,
        title: 'None',
        description: 'Default. No TW goal link on this bundle.',
      },
      {
        value: MENU_CUSTOM,
        title: 'Set UUID',
        description: 'Paste a UUID next (8-4-4-4-12). Numeric IDs are rejected.',
      },
    ],
    MENU_OMIT,
  )
  if (uuidPick === MENU_CUSTOM) {
    const uuid = await askText('Taskwarrior UUID')
    if (uuid !== '') answers.taskwarriorUuid = uuid
  }

  if (Object.keys(profile).length > 0) answers.profile = profile
  return answers
}

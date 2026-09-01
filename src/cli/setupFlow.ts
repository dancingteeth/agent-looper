import path from 'node:path'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  runtimeHonorsReasoningEffort,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'
import { detectionOf, type DetectableRuntime, type DetectionResult } from './detectRuntimes.js'
import {
  HITL_PROVIDER_CHOICES,
  JUDGE_RUNTIME_CHOICES,
  MENU_CUSTOM,
  MENU_OMIT,
  REASONING_EFFORT_CHOICES,
  SECONDARY_REVIEW_RUNTIME_CHOICES,
  WORKER_RUNTIME_CHOICES,
  costPresetChoices,
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
import {
  COST_PRESET_CUSTOM,
  assertUserCostPresetName,
  isCostPreset,
  isReservedCostPresetName,
  resolveCostPreset,
  resolveUserCostPreset,
  type UserCostPresetMap,
} from '../loop/costPreset.js'

export const SETUP_INTRO_HEADING = 'Setup wizard'

export const SETUP_INTRO =
  'Consider this a one-time setup to set defaults and feel in control. You can always ask the harness to adjust a loop without running setup again.'

export const SETUP_GATE_CONTINUE = 'continue'
export const SETUP_GATE_QUIT = 'quit'

export const COST_PRESET_HEADING = 'Cost / quality preset'
export const COST_PRESET_BLURB =
  'Choose a stack of models for running loops, or create your own preset.'
export const SAVE_PRESET_NAME_PROMPT = 'Preset name'
export const SAVE_PRESET_OVERWRITE_HEADING = 'Replace existing preset'
export const SAVE_PRESET_AFTER_CUSTOM_HEADING = 'Save this stack as a named costPreset'

/** Select+text prompts on the all-defaults minmax Cursor-only path, including the intro gate. */
export const TYPICAL_SETUP_STEPS = 35

export class SetupDeclinedError extends Error {
  readonly name = 'SetupDeclinedError'
  constructor() {
    super('setup declined')
  }
}

export type SetupPrompts = {
  select: (
    heading: string,
    blurb: string,
    choices: readonly MenuChoice[],
    defaultValue: string,
  ) => Promise<string>
  text: (prompt: string, dflt?: string) => Promise<string>
}

/** Menu choice value → detectable runtime (both Cline families share the @cline/sdk probe). */
const RUNTIME_DETECT_KEY: Record<string, DetectableRuntime> = {
  [LOOP_RUNTIME_CURSOR]: 'cursor',
  [LOOP_RUNTIME_CLINE]: 'cline',
  [LOOP_RUNTIME_CLINE_PASS]: 'cline',
  [LOOP_RUNTIME_OPENCODE]: 'opencode',
  [LOOP_RUNTIME_PI]: 'pi',
  [LOOP_RUNTIME_CODEX]: 'codex',
  [LOOP_RUNTIME_DSH]: 'dsh',
  [LOOP_RUNTIME_MUSE]: 'muse',
}

/** Tag runtime-menu choices `detected` / `missing`; never drops a choice. */
function annotateDetection(
  choices: readonly MenuChoice[],
  detection: DetectionResult | undefined,
): MenuChoice[] {
  if (!detection) return [...choices]
  return choices.map((choice) => {
    const key = RUNTIME_DETECT_KEY[choice.value]
    if (!key) return choice
    return { ...choice, tag: detection[key] }
  })
}

export async function collectSetupAnswers(
  prompts: SetupPrompts,
  outDir: string,
  detection?: DetectionResult,
  costPresets?: UserCostPresetMap,
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

  const collectCustomWorkerAndJudge = async (): Promise<{
    runtime: LoopRuntime
    model?: string
    escalateModel?: string
    reviewRuntime: LoopRuntime
    reviewModel?: string
  }> => {
    const runtime = (await askSelect(
      'Worker runtime',
      'Who implements GOAL.md each iteration. The judge is a later step.',
      annotateDetection(WORKER_RUNTIME_CHOICES, detection),
      LOOP_RUNTIME_CURSOR,
    )) as LoopRuntime
    const model = await askOptionalSlug(
      'Worker model',
      `Models for ${runtime}. Omit unless you want a non-default.`,
      workerModelChoices(runtime),
      'Custom worker model slug',
    )
    let escalateModel: string | undefined
    if (runtime !== LOOP_RUNTIME_CURSOR && runtime !== LOOP_RUNTIME_MUSE) {
      escalateModel = await askOptionalSlug(
        'Escalate model',
        `Stronger ${runtime} model after repeated identical verify failures. Omit for the default.`,
        escalateModelChoices(runtime),
        'Custom escalate model slug',
      )
    }
    const reviewRuntime = (await askSelect(
      'Judge runtime (reviewRuntime)',
      'Who writes residual review.md after verify. Independent of the worker.',
      annotateDetection(JUDGE_RUNTIME_CHOICES, detection),
      LOOP_RUNTIME_CURSOR,
    )) as LoopRuntime
    const reviewModel = await askOptionalSlug(
      'Judge model (reviewModel)',
      `Models for ${reviewRuntime}. Omit for its default.`,
      judgeModelChoices(reviewRuntime, runtime),
      'Custom judge model slug',
    )
    return { runtime, model, escalateModel, reviewRuntime, reviewModel }
  }

  const gate = await askSelect(
    SETUP_INTRO_HEADING,
    SETUP_INTRO,
    [
      {
        value: SETUP_GATE_CONTINUE,
        title: 'got it, let me set this stuff up anyway',
        description: 'Walk the wizard. Writes repo defaults and this bundle’s loop.json.',
      },
      {
        value: SETUP_GATE_QUIT,
        title: "ok, quit, I'll just ask my agent",
        description: 'Leave now. An agent can patch loop.json and repo defaults without this wizard.',
      },
    ],
    SETUP_GATE_CONTINUE,
  )
  if (gate === SETUP_GATE_QUIT) throw new SetupDeclinedError()

  const detectionForPreset = detection ?? detectionOf({ cursor: 'detected' })
  const costPresetPick = await askSelect(
    COST_PRESET_HEADING,
    COST_PRESET_BLURB,
    costPresetChoices(detectionForPreset, costPresets),
    'minmax',
  )

  const assignStack = (
    stack: {
      runtime: LoopRuntime
      model?: string
      escalateModel?: string
      reviewRuntime: LoopRuntime
      reviewModel?: string
    },
    presetName?: string,
  ): LoopRuntime => {
    if (presetName !== undefined) answers.costPreset = presetName
    answers.runtime = stack.runtime
    answers.reviewRuntime = stack.reviewRuntime
    if (stack.model !== undefined) answers.model = stack.model
    if (stack.escalateModel !== undefined) answers.escalateModel = stack.escalateModel
    if (stack.reviewModel !== undefined) answers.reviewModel = stack.reviewModel
    return stack.runtime
  }

  const promptSavedPresetName = async (): Promise<string> => {
    for (;;) {
      const name = (await askText(SAVE_PRESET_NAME_PROMPT, '')).trim()
      try {
        assertUserCostPresetName(name)
      } catch (err) {
        console.error(`[agent-loop-setup] ${err instanceof Error ? err.message : String(err)}`)
        continue
      }
      if (costPresets && Object.prototype.hasOwnProperty.call(costPresets, name)) {
        const replace = await askBool(
          SAVE_PRESET_OVERWRITE_HEADING,
          `"${name}" is already in profile.costPresets.`,
          false,
          'Replace the existing stack.',
          'Pick a different name.',
        )
        if (!replace) continue
      }
      return name
    }
  }

  let workerRuntime: LoopRuntime
  if (costPresetPick === COST_PRESET_CUSTOM) {
    const stack = await collectCustomWorkerAndJudge()
    workerRuntime = assignStack(stack)
    const save = await askBool(
      SAVE_PRESET_AFTER_CUSTOM_HEADING,
      'Store this worker/judge stack in profile.costPresets for later loops.',
      false,
      'Save under a kebab-case name.',
      'One-off — write the keys, do not add a catalog name.',
    )
    if (save) {
      const name = await promptSavedPresetName()
      answers.saveCostPreset = name
      answers.costPreset = name
    }
  } else if (isCostPreset(costPresetPick)) {
    const stack = resolveCostPreset(costPresetPick, detectionForPreset)
    workerRuntime = assignStack(stack, costPresetPick)
  } else if (
    costPresets &&
    !isReservedCostPresetName(costPresetPick) &&
    Object.prototype.hasOwnProperty.call(costPresets, costPresetPick)
  ) {
    const stack = resolveUserCostPreset(costPresetPick, costPresets)
    workerRuntime = assignStack(stack, costPresetPick)
  } else {
    throw new Error(`unknown costPreset: ${costPresetPick}`)
  }

  answers.escalateAfterStagnation = Number(
    await askSelect(
      'Escalate after N identical failures',
      'How many identical verify failures before switching to a stronger model.',
      escalateAfterChoices(),
      '2',
    ),
  )

  if (runtimeHonorsReasoningEffort(workerRuntime)) {
    const effort = await askSelect(
      'Reasoning effort',
      'How hard the worker thinks per turn. none omits the field (runtime default).',
      REASONING_EFFORT_CHOICES,
      'none',
    )
    if (effort !== 'none') answers.reasoningEffort = effort
    const escalateEffort = await askSelect(
      'Escalate reasoning effort',
      'Ceiling before switching to a stronger model when verify keeps failing.',
      REASONING_EFFORT_CHOICES,
      'none',
    )
    if (escalateEffort !== 'none') answers.escalateReasoningEffort = escalateEffort
  }

  answers.reviewGate = await askBool(
    'Enable review gate (reviewGate)',
    'When on, a blocking review can trigger another implement cycle. Shell verify is still the exit.',
    false,
    'Gate the loop on residual review. Costs extra judge runs.',
    'Off. At most one post-loop review; verify.sh still decides green.',
  )
  answers.maxReviewCycles = Number(
    await askSelect(
      'Max review cycles (maxReviewCycles)',
      'Cap on review-triggered fix rounds. Only used if the review gate is on.',
      maxReviewCyclesChoices(),
      '2',
    ),
  )
  const pqr = await askSelect(
    'Post-quality review',
    'Whether to run residual review after verify. auto uses the risk setting on the next step.',
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
    'Optional second review after the primary judge. Same runtimes as the judge step. none is the usual choice.',
    annotateDetection(SECONDARY_REVIEW_RUNTIME_CHOICES, detection),
    'none',
  )
  if (secondary !== 'none') {
    answers.reviewSecondaryRuntime = secondary
    const secondaryModel = await askOptionalSlug(
      'Secondary judge model (reviewSecondaryModel)',
      `Models for ${secondary}. Omit for its default.`,
      judgeModelChoices(secondary as LoopRuntime, workerRuntime),
      'Custom secondary judge model slug',
    )
    if (secondaryModel !== undefined) answers.reviewSecondaryModel = secondaryModel
  }

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
    'Skip some untrusted-config warnings for this bundle.',
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
  if (answers.notifyTelegram) {
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
  }
  const notifyCommandPick = await askSelect(
    'Custom notifyCommand',
    answers.notifyTelegram
      ? 'Optional shell command in addition to, or instead of, the built-in Telegram sender.'
      : 'Optional shell command to run on loop exit (webhook, Slack, email, …).',
    [
      {
        value: MENU_OMIT,
        title: answers.notifyTelegram ? 'None (built-in Telegram)' : 'None',
        description: answers.notifyTelegram
          ? 'Default. Use loop.json notifyTelegram + env token.'
          : 'Default. No extra shell command on exit.',
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
  if (answers.notifyTelegram) {
    const telegram: Record<string, unknown> = {}
    const chatIdPick = await askSelect(
      'Telegram chatId',
      'Numeric chat id stored in the repo profile. Token stays in env.',
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
      'Attach review.md after the completion message. The loop can still override this.',
      true,
      'Attach review.md at the profile layer (default).',
      'Do not attach from the profile default.',
    )
    profile.telegramNotify = telegram
  }

  const defaultBranch = await askSelect(
    'Repo default branch (diff base)',
    'Git branch used as the merge-base for diffs.',
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
    'Post a completion comment with gh when a pull request is open.',
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
    'When the loop stops without a green verify.',
    false,
    'Open a HITL task/issue on incomplete.',
    'Do not open HITL on incomplete (default).',
  )
  answers.reviewGateHitl = await askBool(
    'Escalate exhausted review gate to a human',
    'When the review gate uses up its cycles without a proceed.',
    false,
    'Open HITL after the gate is exhausted.',
    'Do not escalate the gate to a human (default).',
  )
  if (answers.hitlProvider === 'taskwarrior') {
    const uuidPick = await askSelect(
      'Taskwarrior UUID',
      'Optional loop.json link to a Taskwarrior goal. UUID only — never a numeric ID.',
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
  }

  if (Object.keys(profile).length > 0) answers.profile = profile
  return answers
}

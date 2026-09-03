import {
  CLINE_PASS_LOOP_MODELS,
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODELS,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DSH_VISION_LOOP_MODEL,
  DEFAULT_MUSE_LOOP_MODEL,
  DEFAULT_MUSE_REVIEW_MODEL,
  MUSE_SPARK_1_2_LOOP_MODEL,
  MUSE_SPARK_1_2_REVIEW_MODEL,
  MUSE_SPARK_1_1_MODEL,
  DEFAULT_CLAUDE_LOOP_MODEL,
  DEFAULT_CLAUDE_ESCALATE_MODEL,
  DEFAULT_CLAUDE_REVIEW_MODEL,
  CLAUDE_HAIKU_MODEL,
  CLAUDE_FABLE_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  OPENROUTER_FREE_LOOP_MODELS,
  LOOP_REASONING_EFFORTS,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_CLAUDE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  OPENCODE_GO_LOOP_MODELS,
  defaultModelForRuntime,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'
import {
  COST_PRESET_CUSTOM,
  describeCostPreset,
  describeUserCostPresetRaw,
  userCostPresetMenuTitle,
  isReservedCostPresetName,
  shortModelName,
  type UserCostPresetMap,
} from '../loop/costPreset.js'
import { detectionOf, type DetectionResult } from './detectRuntimes.js'

/** Sentinel: interactive menu then prompts for a free-form slug. */
export const MENU_CUSTOM = '__custom__'

/** Empty value means omit the field and take the schema default. */
export const MENU_OMIT = ''

export type MenuChoice = {
  value: string
  title: string
  description: string
  /** Optional install annotation (`detected` / `missing`) from the runtime probe. */
  tag?: 'detected' | 'missing'
}

/** Named stacks plus create-a-preset. Descriptions bind to this machine’s detection. */
export function costPresetChoices(
  detection?: DetectionResult,
  costPresets?: UserCostPresetMap,
): MenuChoice[] {
  const bound = detection ?? detectionOf({ cursor: 'detected' })
  const builtins: MenuChoice[] = [
    {
      value: 'minmax',
      title: 'minmax — efficiency',
      description: describeCostPreset('minmax', bound),
    },
    {
      value: 'balanced',
      title: 'balanced — spend more on the worker',
      description: describeCostPreset('balanced', bound),
    },
    {
      value: 'cursor',
      title: 'cursor — Composer + Grok',
      description: describeCostPreset('cursor', bound),
    },
  ]
  const userChoices: MenuChoice[] = costPresets
    ? Object.entries(costPresets)
        .filter(([name]) => !isReservedCostPresetName(name))
        .map(([name, raw]) => ({
          value: name,
          title: userCostPresetMenuTitle(name, raw),
          description: describeUserCostPresetRaw(raw),
        }))
    : []
  return [
    ...builtins,
    ...userChoices,
    {
      value: COST_PRESET_CUSTOM,
      title: 'custom — pick worker and judge',
      description:
        'Walk the encyclopedia for this loop. Optionally save the stack as a named preset after.',
    },
  ]
}

export const WORKER_RUNTIME_CHOICES: readonly MenuChoice[] = [
  {
    value: LOOP_RUNTIME_CURSOR,
    title: 'Cursor (cursor)',
    description: 'Cursor SDK. Default worker. Needs CURSOR_API_KEY.',
  },
  {
    value: LOOP_RUNTIME_DSH,
    title: 'DeepSeek Harness (dsh)',
    description: 'DeepSeek’s official harness. Needs `dsh` on PATH.',
  },
  {
    value: LOOP_RUNTIME_OPENCODE,
    title: 'OpenCode (opencode)',
    description: 'OpenCode CLI. Subscription (Go) or your own API key.',
  },
  {
    value: LOOP_RUNTIME_PI,
    title: 'Pi coding agent (pi)',
    description: 'Pi coding agent. Bring-your-own provider/model.',
  },
  {
    value: LOOP_RUNTIME_CODEX,
    title: 'Codex (codex)',
    description: 'OpenAI Codex CLI. ChatGPT login or an OpenAI API key.',
  },
  {
    value: LOOP_RUNTIME_MUSE,
    title: 'Muse Code (muse)',
    description: 'Meta Muse Code CLI. `muse` login or META_API_KEY.',
  },
  {
    value: LOOP_RUNTIME_CLAUDE,
    title: 'Claude Code (claude)',
    description: 'Claude Code CLI. `claude login` (subscription). Needs 2.1.169+.',
  },
  {
    value: LOOP_RUNTIME_CLINE_PASS,
    title: 'Cline (cline-pass)',
    description: 'Cline Pass subscription. Uses cline-pass/ model slugs.',
  },
  {
    value: LOOP_RUNTIME_CLINE,
    title: 'Cline (credits)',
    description: 'Cline usage billing. OpenRouter-style slugs, not cline-pass/.',
  },
]

export const JUDGE_RUNTIME_CHOICES: readonly MenuChoice[] = [
  {
    value: LOOP_RUNTIME_CURSOR,
    title: 'Cursor (cursor)',
    description: 'Cursor SDK judge. Default. Verify.sh still decides green.',
  },
  {
    value: LOOP_RUNTIME_DSH,
    title: 'DeepSeek Harness (dsh)',
    description: 'DeepSeek Harness judge. Default V4 Pro.',
  },
  {
    value: LOOP_RUNTIME_OPENCODE,
    title: 'OpenCode (opencode)',
    description: 'OpenCode judge. Default V4 Pro on Go (not the Flash worker).',
  },
  {
    value: LOOP_RUNTIME_PI,
    title: 'Pi coding agent (pi)',
    description: 'Pi judge. Same default as the Pi worker unless you pick another.',
  },
  {
    value: LOOP_RUNTIME_CODEX,
    title: 'Codex (codex)',
    description: 'Codex judge. Default gpt-5.6-sol.',
  },
  {
    value: LOOP_RUNTIME_MUSE,
    title: 'Muse Code (muse)',
    description: 'Muse Code judge. Default muse-spark-1.3.',
  },
  {
    value: LOOP_RUNTIME_CLAUDE,
    title: 'Claude Code (claude)',
    description: 'Claude Code judge. Default opus. Subscription quota.',
  },
  {
    value: LOOP_RUNTIME_CLINE_PASS,
    title: 'Cline (cline-pass)',
    description: 'Cline Pass judge.',
  },
  {
    value: LOOP_RUNTIME_CLINE,
    title: 'Cline (credits)',
    description: 'Cline credits judge. OpenRouter-style slugs, not cline-pass/.',
  },
]

const CLINE_JUDGE_CHOICES = JUDGE_RUNTIME_CHOICES.filter(
  (choice) => choice.value === LOOP_RUNTIME_CLINE_PASS || choice.value === LOOP_RUNTIME_CLINE,
)
const OTHER_JUDGE_CHOICES = JUDGE_RUNTIME_CHOICES.filter(
  (choice) => choice.value !== LOOP_RUNTIME_CLINE_PASS && choice.value !== LOOP_RUNTIME_CLINE,
)

/** Secondary review: keep both Cline families, then the rest of the judge list. */
export const SECONDARY_REVIEW_RUNTIME_CHOICES: readonly MenuChoice[] = [
  {
    value: 'none',
    title: 'none',
    description: 'Default. One judge runtime is enough.',
  },
  ...CLINE_JUDGE_CHOICES,
  ...OTHER_JUDGE_CHOICES,
]

export const HITL_PROVIDER_CHOICES: readonly MenuChoice[] = [
  {
    value: 'taskwarrior',
    title: 'taskwarrior',
    description: 'Open a Taskwarrior task on HITL. Link goals with a UUID in loop.json, never a numeric ID.',
  },
  {
    value: 'github',
    title: 'github',
    description: 'GitHub issue / comment checkpoint (gh). Needs an authenticated gh CLI.',
  },
  {
    value: 'linear',
    title: 'linear',
    description: 'Linear issue checkpoint.',
  },
  {
    value: 'file',
    title: 'file',
    description: 'Write a HITL marker file in the loop bundle for a human to ack.',
  },
  {
    value: 'command',
    title: 'command',
    description: 'Run a configured HITL command from the repo profile.',
  },
]

export const REASONING_EFFORT_CHOICES: readonly MenuChoice[] = LOOP_REASONING_EFFORTS.map((effort) => ({
  value: effort,
  title: effort,
  description:
    effort === 'none'
      ? 'Omit the field. The runtime uses its default thinking level.'
      : `Higher is slower and more expensive (${effort}).`,
}))

function omitChoice(defaultSlug: string): MenuChoice {
  return {
    value: MENU_OMIT,
    title: 'Default (omit)',
    description: `Use this runtime’s default: ${defaultSlug}.`,
  }
}

function customChoice(example: string): MenuChoice {
  return {
    value: MENU_CUSTOM,
    title: 'Custom slug (type next)',
    description: `Only if the catalog has no match. Example: ${example}. Invalid slugs are rejected at write time.`,
  }
}

/**
 * Same shape for every catalog row: who made it, what it's for, when to pick it.
 * No "catalog slug" filler and no recency-only blurbs.
 */
const MODEL_BLURBS: Record<string, string> = {
  'composer-2.5':
    'Composer 2.5 — Cursor coding model. Composer Fast is rejected.',
  'grok-4.6':
    'xAI Grok 4.6 — usual Cursor judge when the worker is Cursor.',
  'grok-4.5':
    'xAI Grok 4.5 — allowed Cursor judge. Weaker than Grok 4.6 on Cursor.',
  'deepseek-v4-flash':
    'DeepSeek V4 Flash — cheap, fast implement iterations. Common worker default.',
  hy3: 'Tencent Hy3 — slower than Flash, often stronger coding. Large Go monthly quota.',
  'deepseek-v4-flash-vision-exp':
    'DeepSeek V4 Flash Vision (experimental) — image-capable Flash.',
  'deepseek-v4-pro':
    'DeepSeek V4 Pro — large diffs and residual review. Common judge default.',
  'mimo-v2.5':
    'Xiaomi MiMo V2.5 — high-volume cheap edits. Same cost class as Flash.',
  'mimo-v2.5-pro':
    'Xiaomi MiMo V2.5 Pro — same family as V2.5 with more headroom for harder tasks.',
  'minimax-m3':
    'MiniMax M3 — general-purpose coding at mid-cheap quota.',
  'qwen3.7-plus':
    'Qwen3.7 Plus — balanced coding. Usual escalate after Flash stalls; not Max-class quota.',
  'qwen3.7-max':
    'Qwen3.7 Max — heavy coding, one notch below 3.8 Max.',
  'qwen3.8-max':
    'Qwen3.8 Max — heavy / long-context coding. Current Qwen top of this list; burns more quota than Plus.',
  'kimi-k3':
    'Moonshot Kimi K3 — long-horizon agentic coding (plan, multi-file, verify). Strongest Kimi here; heaviest quota.',
  'kimi-k2.7-code':
    'Moonshot Kimi K2.7 Code — coding-specialized. Faster and cheaper than K3; better Kimi for narrow fixes.',
  'kimi-k2.6':
    'Moonshot Kimi K2.6 — general agentic coding. Cheaper than K2.7 Code and K3.',
  'glm-5.3':
    'Z.ai GLM-5.3 — deep reasoning and hard refactors. More capable (and more quota) than GLM-5.2.',
  'glm-5.2':
    'Z.ai GLM-5.2 — deep reasoning at lower quota than 5.3.',
  'gpt-5.6-luna':
    'GPT 5.6 Luna — cheap OpenAI-class worker.',
  'gpt-5.6-terra':
    'GPT 5.6 Terra — balanced escalate when Luna stalls.',
  'gpt-5.6-sol':
    'GPT 5.6 Sol — frontier judge. Do not use as a cheap worker.',
  'muse-spark-1.3-contributor':
    'Muse Spark 1.3 contributor — same model as PAYG. Discounted CLI login; content may train. Default Muse worker.',
  'muse-spark-1.3':
    'Muse Spark 1.3 PAYG — same weights as contributor, billed list price, no contributor training share. Not a stronger model.',
  'muse-spark-1.2-contributor':
    'Muse Spark 1.2 contributor — previous Spark. Prefer 1.3 unless you still have quota here.',
  'muse-spark-1.2':
    'Muse Spark 1.2 PAYG — previous Spark, list price. Same weights as 1.2 contributor; not a stronger model.',
  'muse-spark-1.1':
    'Muse Spark 1.1 — earlier Spark slug. Same adapter; prefer 1.3 unless you still have quota here.',
  sonnet:
    'Claude Sonnet — daily coding. Default Claude worker; burns Max/Pro quota, not Console tokens.',
  opus:
    'Claude Opus — stronger than Sonnet. Default Claude judge and escalate.',
  haiku:
    'Claude Haiku — faster/cheaper Claude alias. Narrow fixes; weaker than Sonnet on hard diffs.',
  fable:
    'Claude Fable — long-horizon / hard-project judge. Same Max/Pro pool as interactive Claude Code.',
  'deepseek-chat':
    'DeepSeek Chat — cheap OpenRouter-style worker. Not a Cline Pass slug.',
  'qwen3-coder-plus':
    'Qwen3 Coder Plus — usual escalate when Chat stalls.',
  'minimax-m3:free':
    'MiniMax M3 on OpenRouter :free — hosted $0 OpenCode worker. Needs OPENROUTER_API_KEY. Not minmax; may train on prompts.',
  'laguna-s-2.1:free':
    'Poolside Laguna S 2.1 on OpenRouter :free — hosted $0 OpenCode judge and escalate. Weaker residual than Grok. Skip NVIDIA :free.',
}

export function modelChoiceDescription(slug: string): string {
  const id = shortModelName(slug)
  return (
    MODEL_BLURBS[id] ??
    MODEL_BLURBS[slug] ??
    `${id} — coding model on this runtime. Pick by cost vs strength for the task.`
  )
}

export function workerModelChoices(runtime: LoopRuntime): MenuChoice[] {
  const omit = omitChoice(defaultModelForRuntime(runtime))
  switch (runtime) {
    case LOOP_RUNTIME_CURSOR:
      return [
        omit,
        {
          value: CURSOR_LOOP_MODEL,
          title: CURSOR_LOOP_MODEL,
          description: modelChoiceDescription(CURSOR_LOOP_MODEL),
        },
      ]
    case LOOP_RUNTIME_DSH:
      return [
        omit,
        {
          value: DEFAULT_DSH_LOOP_MODEL,
          title: DEFAULT_DSH_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_DSH_LOOP_MODEL),
        },
        {
          value: DSH_VISION_LOOP_MODEL,
          title: DSH_VISION_LOOP_MODEL,
          description: modelChoiceDescription(DSH_VISION_LOOP_MODEL),
        },
        {
          value: DEFAULT_DSH_ESCALATE_MODEL,
          title: DEFAULT_DSH_ESCALATE_MODEL,
          description: modelChoiceDescription(DEFAULT_DSH_ESCALATE_MODEL),
        },
      ]
    case LOOP_RUNTIME_CLINE_PASS:
      return [
        omit,
        ...CLINE_PASS_LOOP_MODELS.map((slug) => ({
          value: slug,
          title: slug,
          description: modelChoiceDescription(slug),
        })),
      ]
    case LOOP_RUNTIME_OPENCODE:
      return [
        omit,
        ...OPENCODE_GO_LOOP_MODELS.map((slug) => ({
          value: slug,
          title: slug,
          description: modelChoiceDescription(slug),
        })),
        ...OPENROUTER_FREE_LOOP_MODELS.map((slug) => ({
          value: slug,
          title: slug,
          description: modelChoiceDescription(slug),
        })),
        customChoice('openrouter/deepseek/deepseek-chat'),
      ]
    case LOOP_RUNTIME_CLINE:
      return [
        omit,
        {
          value: DEFAULT_CLINE_CREDITS_LOOP_MODEL,
          title: DEFAULT_CLINE_CREDITS_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_CLINE_CREDITS_LOOP_MODEL),
        },
        {
          value: DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
          title: DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
          description: modelChoiceDescription(DEFAULT_CLINE_CREDITS_ESCALATE_MODEL),
        },
        customChoice('minimax/minimax-m2.5'),
      ]
    case LOOP_RUNTIME_PI:
      return [
        omit,
        {
          value: DEFAULT_PI_LOOP_MODEL,
          title: DEFAULT_PI_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_PI_LOOP_MODEL),
        },
        {
          value: DEFAULT_PI_ESCALATE_MODEL,
          title: DEFAULT_PI_ESCALATE_MODEL,
          description: modelChoiceDescription(DEFAULT_PI_ESCALATE_MODEL),
        },
        customChoice('openrouter/qwen/qwen3-coder-plus'),
      ]
    case LOOP_RUNTIME_CODEX:
      return [
        omit,
        {
          value: DEFAULT_CODEX_LOOP_MODEL,
          title: DEFAULT_CODEX_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_CODEX_LOOP_MODEL),
        },
        {
          value: DEFAULT_CODEX_ESCALATE_MODEL,
          title: DEFAULT_CODEX_ESCALATE_MODEL,
          description: modelChoiceDescription(DEFAULT_CODEX_ESCALATE_MODEL),
        },
        {
          value: DEFAULT_CODEX_REVIEW_MODEL,
          title: DEFAULT_CODEX_REVIEW_MODEL,
          description: modelChoiceDescription(DEFAULT_CODEX_REVIEW_MODEL),
        },
      ]
    case LOOP_RUNTIME_MUSE:
      return [
        omit,
        {
          value: DEFAULT_MUSE_LOOP_MODEL,
          title: DEFAULT_MUSE_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_MUSE_LOOP_MODEL),
        },
        {
          value: DEFAULT_MUSE_REVIEW_MODEL,
          title: DEFAULT_MUSE_REVIEW_MODEL,
          description: modelChoiceDescription(DEFAULT_MUSE_REVIEW_MODEL),
        },
        {
          value: MUSE_SPARK_1_2_LOOP_MODEL,
          title: MUSE_SPARK_1_2_LOOP_MODEL,
          description: modelChoiceDescription(MUSE_SPARK_1_2_LOOP_MODEL),
        },
        {
          value: MUSE_SPARK_1_2_REVIEW_MODEL,
          title: MUSE_SPARK_1_2_REVIEW_MODEL,
          description: modelChoiceDescription(MUSE_SPARK_1_2_REVIEW_MODEL),
        },
        {
          value: MUSE_SPARK_1_1_MODEL,
          title: MUSE_SPARK_1_1_MODEL,
          description: modelChoiceDescription(MUSE_SPARK_1_1_MODEL),
        },
      ]
    case LOOP_RUNTIME_CLAUDE:
      return [
        omit,
        {
          value: DEFAULT_CLAUDE_LOOP_MODEL,
          title: DEFAULT_CLAUDE_LOOP_MODEL,
          description: modelChoiceDescription(DEFAULT_CLAUDE_LOOP_MODEL),
        },
        {
          value: DEFAULT_CLAUDE_ESCALATE_MODEL,
          title: DEFAULT_CLAUDE_ESCALATE_MODEL,
          description: modelChoiceDescription(DEFAULT_CLAUDE_ESCALATE_MODEL),
        },
        {
          value: CLAUDE_FABLE_MODEL,
          title: CLAUDE_FABLE_MODEL,
          description: modelChoiceDescription(CLAUDE_FABLE_MODEL),
        },
        {
          value: CLAUDE_HAIKU_MODEL,
          title: CLAUDE_HAIKU_MODEL,
          description: modelChoiceDescription(CLAUDE_HAIKU_MODEL),
        },
      ]
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

export function escalateModelChoices(runtime: LoopRuntime): MenuChoice[] {
  if (runtime === LOOP_RUNTIME_MUSE) {
    return [omitChoice(defaultModelForRuntime(runtime))]
  }
  return workerModelChoices(runtime)
}

export function judgeModelChoices(reviewRuntime: LoopRuntime, workerRuntime: LoopRuntime): MenuChoice[] {
  const omitDefault =
    reviewRuntime === LOOP_RUNTIME_CURSOR
      ? workerRuntime === LOOP_RUNTIME_CURSOR
        ? 'grok-4.6'
        : CURSOR_LOOP_MODEL
      : reviewRuntime === LOOP_RUNTIME_DSH
        ? DEFAULT_DSH_REVIEW_MODEL
        : reviewRuntime === LOOP_RUNTIME_OPENCODE
          ? DEFAULT_OPENCODE_GO_REVIEW_MODEL
          : reviewRuntime === LOOP_RUNTIME_CODEX
            ? DEFAULT_CODEX_REVIEW_MODEL
            : reviewRuntime === LOOP_RUNTIME_MUSE
              ? DEFAULT_MUSE_REVIEW_MODEL
              : reviewRuntime === LOOP_RUNTIME_CLAUDE
                ? DEFAULT_CLAUDE_REVIEW_MODEL
            : defaultModelForRuntime(reviewRuntime)
  const omit = omitChoice(omitDefault)
  switch (reviewRuntime) {
    case LOOP_RUNTIME_CURSOR:
      return [
        omit,
        ...CURSOR_REVIEW_MODELS.map((slug) => ({
          value: slug,
          title: slug,
          description: modelChoiceDescription(slug),
        })),
      ]
    case LOOP_RUNTIME_DSH:
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_CLINE:
    case LOOP_RUNTIME_OPENCODE:
    case LOOP_RUNTIME_PI:
    case LOOP_RUNTIME_CODEX:
    case LOOP_RUNTIME_MUSE:
    case LOOP_RUNTIME_CLAUDE:
      return workerModelChoices(reviewRuntime).map((choice, index) =>
        index === 0
          ? omit
          : choice,
      )
    default: {
      const _exhaustive: never = reviewRuntime
      return _exhaustive
    }
  }
}

export function escalateAfterChoices(): MenuChoice[] {
  return [
    {
      value: '2',
      title: '2',
      description: 'Default. Switch models after two identical verify failures.',
    },
    {
      value: '1',
      title: '1',
      description: 'Escalate on the first identical failure. Faster spend, less thrash on a stuck model.',
    },
    {
      value: '3',
      title: '3',
      description: 'Wait longer before switching models.',
    },
  ]
}

export function maxIterationsChoices(): MenuChoice[] {
  return [
    {
      value: '8',
      title: '8',
      description: 'Default budget. Stop when verify is green; this is a cap, not a target.',
    },
    {
      value: '3',
      title: '3',
      description: 'Tiny smoke / cheap runtime check.',
    },
    {
      value: '5',
      title: '5',
      description: 'Short grind.',
    },
    {
      value: '12',
      title: '12',
      description: 'Longer permission. Still stop at green verify.',
    },
  ]
}

export function stagnationChoices(): MenuChoice[] {
  return [
    {
      value: '3',
      title: '3',
      description: 'Default. Abort after three identical verify failures (stagnation).',
    },
    {
      value: '2',
      title: '2',
      description: 'Fail faster when the worker is looping the same error.',
    },
    {
      value: '5',
      title: '5',
      description: 'More room before the harness calls it stuck.',
    },
  ]
}

export function maxReviewCyclesChoices(): MenuChoice[] {
  return [
    {
      value: '2',
      title: '2',
      description: 'Default. How many review-triggered fix rounds when reviewGate is on.',
    },
    {
      value: '1',
      title: '1',
      description: 'One gate cycle only — cheaper, easier to exhaust.',
    },
    {
      value: '3',
      title: '3',
      description: 'More gate rounds. Does not replace shell verify.',
    },
  ]
}

export function yesNoChoices(yesDescription: string, noDescription: string): MenuChoice[] {
  return [
    { value: 'y', title: 'Yes', description: yesDescription },
    { value: 'n', title: 'No', description: noDescription },
  ]
}

export function defaultIndexForValue(choices: readonly MenuChoice[], value: string): number {
  const index = choices.findIndex((choice) => choice.value === value)
  return index >= 0 ? index : 0
}

export function formatMenu(
  heading: string,
  blurb: string,
  choices: readonly MenuChoice[],
  defaultIndex: number,
): string {
  const items = choices.map((choice, index) => {
    const mark = index === defaultIndex ? ' (default)' : ''
    const tag = choice.tag ? ` [${choice.tag}]` : ''
    return `  ${index + 1}) ${choice.title}${mark}${tag}\n     ${choice.description}`
  })
  return ['', `## ${heading}`, blurb, '', ...items, `Select [1-${choices.length}]:`].join('\n')
}

/** 0-based index, or null if the line is not a valid selection. Empty line → default. */
export function parseMenuSelection(
  line: string,
  count: number,
  defaultIndex: number,
): number | null {
  const trimmed = line.trim()
  if (trimmed === '') return defaultIndex
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  if (n < 1 || n > count) return null
  return n - 1
}

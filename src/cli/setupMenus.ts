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
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  LOOP_REASONING_EFFORTS,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  OPENCODE_GO_LOOP_MODELS,
  defaultModelForRuntime,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'

/** Sentinel: interactive menu then prompts for a free-form slug. */
export const MENU_CUSTOM = '__custom__'

/** Empty value means omit the field and take the schema default. */
export const MENU_OMIT = ''

export type MenuChoice = {
  value: string
  title: string
  description: string
}

export const WORKER_RUNTIME_CHOICES: readonly MenuChoice[] = [
  {
    value: LOOP_RUNTIME_CURSOR,
    title: 'Cursor (cursor)',
    description:
      'Cursor SDK. Default dogfood worker (Composer 2.5). Needs CURSOR_API_KEY. Composer Fast is rejected.',
  },
  {
    value: LOOP_RUNTIME_DSH,
    title: 'DeepSeek Harness (dsh)',
    description:
      'Official DeepSeek Harness. Spawns PATH `dsh --profile headless` (not an npm dependency). Node ≥ 22.15. From dsh web, use Full Access so nested headless can write ~/.dsh/profiles/headless/.',
  },
  {
    value: LOOP_RUNTIME_OPENCODE,
    title: 'OpenCode (opencode)',
    description:
      'OpenCode CLI — Go subscription slugs (opencode-go/…) or BYOK (openrouter/…, vercel/…). Do not paste a DSH-web-only model onto a standalone OpenCode install.',
  },
  {
    value: LOOP_RUNTIME_PI,
    title: 'Pi coding agent (pi)',
    description:
      'Pi (`@earendil-works/pi-coding-agent`). BYOK OpenRouter-class provider/model. Not opencode-go slugs.',
  },
  {
    value: LOOP_RUNTIME_CODEX,
    title: 'Codex (codex)',
    description:
      'OpenAI Codex CLI. ChatGPT login or CODEX_API_KEY / OPENAI_API_KEY. Luna worker, Sol judge.',
  },
  {
    value: LOOP_RUNTIME_CLINE_PASS,
    title: 'Cline Pass (cline-pass)',
    description:
      'Cline Pass subscription quota (`cline-pass/…` slugs). Same CLINE_API_KEY as Cline credits.',
  },
  {
    value: LOOP_RUNTIME_CLINE,
    title: 'Cline credits (cline)',
    description:
      'Cline usage-billing (pay-as-you-go). OpenRouter-style provider/model. Not cline-pass/ slugs.',
  },
]

export const JUDGE_RUNTIME_CHOICES: readonly MenuChoice[] = [
  {
    value: LOOP_RUNTIME_CURSOR,
    title: 'Cursor (cursor)',
    description:
      'Cursor SDK judge. Default when unset. Grok 4.6 if the worker is also Cursor; otherwise Composer 2.5. Residual quality — shell verify is still the exit.',
  },
  {
    value: LOOP_RUNTIME_DSH,
    title: 'DeepSeek Harness (dsh)',
    description:
      'Headless DeepSeek Harness judge. Default model V4 Pro. Keeps residual review off Cursor quota. Same Full Access note as the worker.',
  },
  {
    value: LOOP_RUNTIME_OPENCODE,
    title: 'OpenCode (opencode)',
    description:
      'OpenCode judge. Default opencode-go/deepseek-v4-pro (not Flash). Residual review — shell verify is still the exit.',
  },
  {
    value: LOOP_RUNTIME_PI,
    title: 'Pi coding agent (pi)',
    description:
      'Pi judge. Defaults to the Pi worker model unless you pick another BYOK slug. Not opencode-go.',
  },
  {
    value: LOOP_RUNTIME_CODEX,
    title: 'Codex (codex)',
    description:
      'Codex judge. Default gpt-5.6-sol (frontier), not the cheap Luna worker.',
  },
  {
    value: LOOP_RUNTIME_CLINE_PASS,
    title: 'Cline Pass (cline-pass)',
    description:
      'Cline Pass judge. Pick a Pass catalog slug; omit uses the Pass worker default.',
  },
  {
    value: LOOP_RUNTIME_CLINE,
    title: 'Cline credits (cline)',
    description:
      'Cline credits judge. OpenRouter-style slug, not cline-pass/.',
  },
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
      ? 'Omit reasoningEffort (Cline default). Skip for cursor/dsh/opencode/pi/codex.'
      : `Cline SDK reasoningEffort="${effort}". Higher is slower and more expensive.`,
}))

function omitChoice(defaultSlug: string): MenuChoice {
  return {
    value: MENU_OMIT,
    title: 'Runtime default (omit from loop.json)',
    description: `Do not write the field. Schema default: ${defaultSlug}.`,
  }
}

function customChoice(example: string): MenuChoice {
  return {
    value: MENU_CUSTOM,
    title: 'Custom slug (type next)',
    description: `Only if the catalog has no match. Example: ${example}. Invalid slugs are rejected at write time.`,
  }
}

/** Last path segment (`cline-pass/kimi-k3` → `kimi-k3`; `gpt-5.6-luna` stays). */
function catalogId(slug: string): string {
  const slash = slug.lastIndexOf('/')
  return slash === -1 ? slug : slug.slice(slash + 1)
}

/**
 * Same shape for every catalog row: who made it, what it's for, when to pick it.
 * No "catalog slug" filler and no recency-only blurbs.
 */
const MODEL_BLURBS: Record<string, string> = {
  'composer-2.5':
    'Composer 2.5 — only allowed Cursor worker. Also the Cursor judge when the worker is not Cursor. Composer Fast is rejected.',
  'grok-4.6':
    'xAI Grok 4.6 — preferred Cursor judge when the worker is also Cursor.',
  'grok-4.5':
    'xAI Grok 4.5 — allowed Cursor judge; also on OpenCode Go. Weaker than Grok 4.6 on Cursor.',
  'deepseek-v4-flash':
    'DeepSeek V4 Flash — cheap, fast implement iterations. Usual worker default on Pass, Go, and DeepSeek Harness.',
  'deepseek-v4-flash-vision-exp':
    'DeepSeek V4 Flash Vision (exp) — image-capable official API. Catalog must set inputModalities [text, image] (settings.yaml + headless patch); a vision name alone stays text-only.',
  'deepseek-v4-pro':
    'DeepSeek V4 Pro — large diffs and residual review. Usual judge on DeepSeek Harness and OpenCode Go.',
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
    'GPT 5.6 Luna — cheap OpenAI-class worker. Usual Codex worker; also on OpenCode Go.',
  'gpt-5.6-terra':
    'GPT 5.6 Terra — balanced Codex escalate when Luna stalls.',
  'gpt-5.6-sol':
    'GPT 5.6 Sol — frontier Codex judge. Do not use as a cheap worker.',
  'deepseek-chat':
    'DeepSeek Chat — cheap OpenRouter-style worker (Cline credits / Pi). Not a Cline Pass slug.',
  'qwen3-coder-plus':
    'Qwen3 Coder Plus — usual credits/Pi escalate when Chat stalls. Avoid Gemini in this stack.',
}

export function modelChoiceDescription(slug: string): string {
  const id = catalogId(slug)
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
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

export function escalateModelChoices(runtime: LoopRuntime): MenuChoice[] {
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
      description: 'Default. Switch escalateModel after two identical verify failures (after reasoning ceiling).',
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
    return `  ${index + 1}) ${choice.title}${mark}\n     ${choice.description}`
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

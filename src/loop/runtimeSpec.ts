import {
  CLINE_PASS_LOOP_MODELS,
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODEL,
  CURSOR_REVIEW_MODELS,
  CURSOR_WORKER_MODEL,
  DEFAULT_CLAUDE_ESCALATE_MODEL,
  DEFAULT_CLAUDE_LOOP_MODEL,
  DEFAULT_CLAUDE_REVIEW_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_LOOP_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DEFAULT_MUSE_LOOP_MODEL,
  DEFAULT_MUSE_REVIEW_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_LOOP_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  isClaudeLoopModel,
  isClineCreditsModelShape,
  isClinePassModel,
  isCodexLoopModel,
  isCursorSdkModel,
  isDshLoopModel,
  isMuseLoopModel,
  isOpencodeLoopModel,
  isPiLoopModel,
  LOOP_RUNTIME_CLAUDE,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type LoopRuntime,
} from './modelCatalog.js'

/**
 * One row per runtime: defaults, model-shape validation, and capability flags.
 * Every runtime-dispatch in the harness reads this table instead of branching on the id.
 */
export type RuntimeSpec = {
  defaultWorkerModel: string
  /** Recommended `escalateModel` (wizard / presets). Unset when the runtime has no stronger tier. */
  defaultEscalateModel?: string
  /** Judge default. Cursor picks Grok only when the worker is also Cursor (Composer otherwise). */
  defaultReviewModel: (workerRuntime: LoopRuntime) => string
  isWorkerModel: (model: string) => boolean
  /** Judge-model shape when it differs from the worker shape (Cursor allows Grok + Composer). */
  isReviewModel?: (model: string) => boolean
  /** Appended to invalid-model errors. May specialise on the offending model. */
  modelHint: (model: string) => string
  /** Whether the runner forwards `reasoningEffort` to the provider. */
  honorsReasoningEffort: boolean
  /** Whether the setup wizard offers an `escalateModel` pick (schema still accepts one). */
  offersEscalateModel: boolean
}

const OPENCODE_SHAPE_HINT =
  'Expected provider/model (Go: opencode-go/… from OPENCODE_GO_LOOP_MODELS; ' +
  'BYOK: e.g. openrouter/…, openrouter/…:free, vercel/…, ollama/… — https://opencode.ai/docs/providers/).'

export const RUNTIME_SPEC: Record<LoopRuntime, RuntimeSpec> = {
  [LOOP_RUNTIME_CURSOR]: {
    defaultWorkerModel: CURSOR_LOOP_MODEL,
    defaultReviewModel: (workerRuntime) =>
      workerRuntime === LOOP_RUNTIME_CURSOR ? CURSOR_REVIEW_MODEL : CURSOR_WORKER_MODEL,
    isWorkerModel: (model) => model === CURSOR_LOOP_MODEL,
    isReviewModel: (model) => isCursorSdkModel(model) && !model.toLowerCase().includes('fast'),
    modelHint: (model) =>
      model.toLowerCase().includes('fast')
        ? `"${model}" is banned — do not use Composer Fast in loops.`
        : `Worker is always "${CURSOR_WORKER_MODEL}"; judges allow ${CURSOR_REVIEW_MODELS.join(', ')}.`,
    honorsReasoningEffort: false,
    offersEscalateModel: false,
  },
  [LOOP_RUNTIME_CLINE_PASS]: {
    defaultWorkerModel: DEFAULT_CLINE_PASS_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_CLINE_PASS_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_CLINE_PASS_LOOP_MODEL,
    isWorkerModel: isClinePassModel,
    modelHint: () => `Use a ClinePass slug from CLINE_PASS_LOOP_MODELS (${CLINE_PASS_LOOP_MODELS.length} ids).`,
    honorsReasoningEffort: true,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_CLINE]: {
    defaultWorkerModel: DEFAULT_CLINE_CREDITS_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_CLINE_CREDITS_LOOP_MODEL,
    isWorkerModel: isClineCreditsModelShape,
    modelHint: (model) =>
      model.startsWith('cline-pass/')
        ? `ClinePass slugs are not valid for runtime "cline" (credits). Use an OpenRouter-style id such as ` +
          `"${DEFAULT_CLINE_CREDITS_LOOP_MODEL}" (see https://docs.cline.bot/api/models).`
        : `Expected provider/model for Cline credits (e.g. "${DEFAULT_CLINE_CREDITS_LOOP_MODEL}").`,
    honorsReasoningEffort: true,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_OPENCODE]: {
    defaultWorkerModel: DEFAULT_OPENCODE_GO_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_OPENCODE_GO_REVIEW_MODEL,
    isWorkerModel: isOpencodeLoopModel,
    modelHint: (model) =>
      model.startsWith('opencode-go/')
        ? `Unknown OpenCode Go slug. Use a slug from OPENCODE_GO_LOOP_MODELS (see https://opencode.ai/docs/go/).`
        : OPENCODE_SHAPE_HINT,
    honorsReasoningEffort: false,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_PI]: {
    defaultWorkerModel: DEFAULT_PI_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_PI_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_PI_LOOP_MODEL,
    isWorkerModel: isPiLoopModel,
    modelHint: (model) =>
      model.startsWith('opencode-go/')
        ? `OpenCode Go slugs are not valid for runtime "pi". Use BYOK provider/model ` +
          `(e.g. "${DEFAULT_PI_LOOP_MODEL}") or runtime "opencode".`
        : `Expected provider/model (e.g. "${DEFAULT_PI_LOOP_MODEL}") — https://pi.dev/docs`,
    honorsReasoningEffort: true,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_CODEX]: {
    defaultWorkerModel: DEFAULT_CODEX_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_CODEX_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_CODEX_REVIEW_MODEL,
    isWorkerModel: isCodexLoopModel,
    modelHint: () =>
      `Expected a Codex CLI slug (e.g. "${DEFAULT_CODEX_LOOP_MODEL}") — https://github.com/openai/codex`,
    honorsReasoningEffort: false,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_DSH]: {
    defaultWorkerModel: DEFAULT_DSH_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_DSH_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_DSH_REVIEW_MODEL,
    isWorkerModel: isDshLoopModel,
    modelHint: () =>
      `Expected provider/model (e.g. "${DEFAULT_DSH_LOOP_MODEL}") for headless agent-default-model.`,
    honorsReasoningEffort: false,
    offersEscalateModel: true,
  },
  [LOOP_RUNTIME_MUSE]: {
    defaultWorkerModel: DEFAULT_MUSE_LOOP_MODEL,
    defaultReviewModel: () => DEFAULT_MUSE_REVIEW_MODEL,
    isWorkerModel: isMuseLoopModel,
    modelHint: () =>
      `Expected a Muse Spark slug (e.g. "${DEFAULT_MUSE_LOOP_MODEL}") — https://dev.meta.ai/docs/muse-code`,
    honorsReasoningEffort: true,
    // PAYG Spark is the same weights as contributor — a billing pick, not a stronger tier.
    offersEscalateModel: false,
  },
  [LOOP_RUNTIME_CLAUDE]: {
    defaultWorkerModel: DEFAULT_CLAUDE_LOOP_MODEL,
    defaultEscalateModel: DEFAULT_CLAUDE_ESCALATE_MODEL,
    defaultReviewModel: () => DEFAULT_CLAUDE_REVIEW_MODEL,
    isWorkerModel: isClaudeLoopModel,
    modelHint: () =>
      `Expected a Claude Code slug (e.g. "${DEFAULT_CLAUDE_LOOP_MODEL}") — https://code.claude.com/docs/en/model-config`,
    honorsReasoningEffort: false,
    offersEscalateModel: true,
  },
}

/** loop.json fields that name a model; carried on {@link AgentModelError} for zod issue paths. */
export type AgentModelField = 'model' | 'escalateModel' | 'reviewModel' | 'reviewSecondaryModel'

/** Thrown by {@link assertRuntimeModel}; `field` lets the schema attach the issue to the right key. */
export class AgentModelError extends Error {
  constructor(
    message: string,
    readonly field: AgentModelField,
  ) {
    super(message)
    this.name = 'AgentModelError'
  }
}

/**
 * Validate `model` against the runtime's shape and return it. `role` selects the judge shape
 * where it differs (Cursor). `field` / `runtimeField` only affect the error text.
 */
export function assertRuntimeModel(
  runtime: LoopRuntime,
  model: string,
  role: 'worker' | 'review',
  field: AgentModelField,
  runtimeField = 'runtime',
): string {
  const spec = RUNTIME_SPEC[runtime]
  const isValid = role === 'review' ? (spec.isReviewModel ?? spec.isWorkerModel) : spec.isWorkerModel
  if (isValid(model)) return model
  throw new AgentModelError(
    `Invalid ${field} "${model}" for ${runtimeField} "${runtime}". ${spec.modelHint(model)}`,
    field,
  )
}

export function defaultModelForRuntime(runtime: LoopRuntime): string {
  return RUNTIME_SPEC[runtime].defaultWorkerModel
}

/** Default judge model for `reviewRuntime`; Cursor depends on the worker runtime. */
export function defaultReviewModel(reviewRuntime: LoopRuntime, workerRuntime: LoopRuntime): string {
  return RUNTIME_SPEC[reviewRuntime].defaultReviewModel(workerRuntime)
}

/**
 * Whether the worker runner actually sends `reasoningEffort` to the provider.
 * Wizard, resolveLoopAgent, and the iteration ladder all use this — do not
 * special-case Cline in those call sites.
 */
export function runtimeHonorsReasoningEffort(runtime: LoopRuntime): boolean {
  return RUNTIME_SPEC[runtime].honorsReasoningEffort
}

/** Whether the setup wizard should offer an `escalateModel` pick for this worker runtime. */
export function runtimeOffersEscalateModel(runtime: LoopRuntime): boolean {
  return RUNTIME_SPEC[runtime].offersEscalateModel
}

export function modelCompatibleWithRuntime(runtime: LoopRuntime, model: string | undefined): boolean {
  if (model === undefined) return true
  return RUNTIME_SPEC[runtime].isWorkerModel(model)
}

/** Judge models: cursor allows Grok + Composer; other runtimes match worker shape. */
export function reviewModelCompatibleWithRuntime(
  runtime: LoopRuntime,
  model: string | undefined,
): boolean {
  if (model === undefined) return true
  const spec = RUNTIME_SPEC[runtime]
  return (spec.isReviewModel ?? spec.isWorkerModel)(model)
}

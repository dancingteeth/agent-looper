import type { LoopConfig } from '../loop/loopConfig.js'
import { assertCursorSdkModelAllowed, assertLoopModelAllowed } from '../usage/modelPolicy.js'

export const LOOP_RUNTIME_CURSOR = 'cursor' as const
export const LOOP_RUNTIME_CLINE_PASS = 'cline-pass' as const
/** Cline usage-billing (pay-as-you-go credits). Same SDK/API key as ClinePass. */
export const LOOP_RUNTIME_CLINE = 'cline' as const
/** OpenCode worker (`provider/model` — Go subscription, OpenRouter / Vercel BYOK, Ollama, …). */
export const LOOP_RUNTIME_OPENCODE = 'opencode' as const
/** Pi coding agent (`@earendil-works/pi-coding-agent`) — BYOK `provider/model` (not opencode-go). */
export const LOOP_RUNTIME_PI = 'pi' as const
/** OpenAI Codex (`@openai/codex-sdk`) — Codex CLI model slugs (e.g. gpt-5.6-luna). */
export const LOOP_RUNTIME_CODEX = 'codex' as const
/** DeepSeek Harness worker — spawn `dsh --profile headless` (PATH CLI, no npm dep). */
export const LOOP_RUNTIME_DSH = 'dsh' as const
/** Muse Code (`@muse-code/sdk` + PATH `muse serve`) — Muse Spark slugs (e.g. muse-spark-1.2). */
export const LOOP_RUNTIME_MUSE = 'muse' as const

/** Canonical runtime ids — CLI flags, loop.json, and `loopRuntimeSchema` share this list. */
export const LOOP_RUNTIME_VALUES = [
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
] as const

export type LoopRuntime = (typeof LOOP_RUNTIME_VALUES)[number]

export const CURSOR_LOOP_MODEL = 'composer-2.5' as const
/** Alias — Cursor SDK worker for implement iterations (never Composer Fast). */
export const CURSOR_WORKER_MODEL = CURSOR_LOOP_MODEL
/**
 * Cursor SDK judge for post-loop / review-gate runs.
 * Confirm via `Cursor.models.list()` if your account uses a different id.
 */
export const CURSOR_REVIEW_MODEL = 'grok-4.6' as const

export const CURSOR_REVIEW_MODELS = [CURSOR_REVIEW_MODEL, 'grok-4.5', CURSOR_WORKER_MODEL] as const
export type CursorReviewModel = (typeof CURSOR_REVIEW_MODELS)[number]
export type CursorSdkModel = typeof CURSOR_WORKER_MODEL | CursorReviewModel

/** Canonical slugs — https://docs.cline.bot/getting-started/clinepass */
export const CLINE_PASS_LOOP_MODELS = [
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/minimax-m3',
  'cline-pass/qwen3.7-plus',
  'cline-pass/kimi-k3',
  'cline-pass/kimi-k2.7-code',
  'cline-pass/deepseek-v4-pro',
  'cline-pass/glm-5.3',
  'cline-pass/glm-5.2',
  'cline-pass/kimi-k2.6',
  'cline-pass/mimo-v2.5-pro',
  'cline-pass/qwen3.8-max',
  'cline-pass/qwen3.7-max',
] as const

export type ClinePassLoopModel = (typeof CLINE_PASS_LOOP_MODELS)[number]

export const DEFAULT_CLINE_PASS_LOOP_MODEL: ClinePassLoopModel = 'cline-pass/deepseek-v4-flash'
export const DEFAULT_CLINE_PASS_ESCALATE_MODEL: ClinePassLoopModel = 'cline-pass/qwen3.7-plus'

/** Default OpenRouter-style id for Cline credits (usage-billing). https://docs.cline.bot/api/models */
export const DEFAULT_CLINE_CREDITS_LOOP_MODEL = 'deepseek/deepseek-chat'
/** Mid-tier escalate recommendation for credits (Qwen coder — avoid Gemini in the default stack). */
export const DEFAULT_CLINE_CREDITS_ESCALATE_MODEL = 'qwen/qwen3-coder-plus'

/**
 * OpenCode Go curated slugs — https://opencode.ai/docs/go/
 * Format: `opencode-go/<modelID>` (providerID `opencode-go`).
 */
export const OPENCODE_GO_LOOP_MODELS = [
  'opencode-go/deepseek-v4-flash',
  'opencode-go/hy3',
  'opencode-go/mimo-v2.5',
  'opencode-go/minimax-m3',
  'opencode-go/qwen3.7-plus',
  'opencode-go/kimi-k3',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/glm-5.3',
  'opencode-go/glm-5.2',
  'opencode-go/kimi-k2.6',
  'opencode-go/mimo-v2.5-pro',
  'opencode-go/qwen3.8-max',
  'opencode-go/qwen3.7-max',
  'opencode-go/gpt-5.6-luna',
  'opencode-go/grok-4.5',
] as const

export type OpencodeGoLoopModel = (typeof OPENCODE_GO_LOOP_MODELS)[number]

export const DEFAULT_OPENCODE_GO_LOOP_MODEL: OpencodeGoLoopModel = 'opencode-go/deepseek-v4-flash'
export const DEFAULT_OPENCODE_GO_ESCALATE_MODEL: OpencodeGoLoopModel = 'opencode-go/qwen3.7-plus'
/** Default OpenCode judge — DeepSeek V4 Pro (Go has Grok 4.5 only; not Flash). */
export const DEFAULT_OPENCODE_GO_REVIEW_MODEL: OpencodeGoLoopModel = 'opencode-go/deepseek-v4-pro'

/** Default Pi worker — OpenRouter DeepSeek (same shape as Cline credits). */
export const DEFAULT_PI_LOOP_MODEL = 'openrouter/deepseek/deepseek-chat'
export const DEFAULT_PI_ESCALATE_MODEL = 'openrouter/qwen/qwen3-coder-plus'

/** Default Codex worker — Luna (cheap); escalate to Terra (balanced). Catalog: openai/codex models.json */
export const DEFAULT_CODEX_LOOP_MODEL = 'gpt-5.6-luna'
export const DEFAULT_CODEX_ESCALATE_MODEL = 'gpt-5.6-terra'
/** Default Codex judge — Sol (frontier agentic coding). */
export const DEFAULT_CODEX_REVIEW_MODEL = 'gpt-5.6-sol'

/** Default DSH worker — official DeepSeek Flash (headless `agent-default-model`). */
export const DEFAULT_DSH_LOOP_MODEL = 'deepseek-official/deepseek-v4-flash'
/** Experimental vision Flash. DSH `read_image` works once the catalog row sets `inputModalities: [text, image]`. */
export const DSH_VISION_LOOP_MODEL = 'deepseek-official/deepseek-v4-flash-vision-exp'
export const DEFAULT_DSH_ESCALATE_MODEL = 'deepseek-official/deepseek-v4-pro'
/** Default DSH judge — V4 Pro (same split as Flash worker / Pro judge). */
export const DEFAULT_DSH_REVIEW_MODEL = 'deepseek-official/deepseek-v4-pro'

/** Default Muse worker — Spark 1.2 contributor (CLI login / discounted tokens). */
export const DEFAULT_MUSE_LOOP_MODEL = 'muse-spark-1.2-contributor'
/** Default Muse judge — PAYG Spark 1.2 (same weights as contributor; billing/privacy, not a stronger model). */
export const DEFAULT_MUSE_REVIEW_MODEL = 'muse-spark-1.2'
/** Prior Spark slug the adapter still prices and accepts. */
export const MUSE_SPARK_1_1_MODEL = 'muse-spark-1.1'

/** Codex CLI model slug (not provider/model). */
const CODEX_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/

/** Muse Spark model id (not provider/model). */
const MUSE_MODEL_RE = /^muse-spark-[0-9]+(\.[0-9]+)?(-[a-z0-9]+)?$/

/** OpenRouter-style `provider/model` (Cline usage-billing / API). */
const CLINE_CREDITS_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

/** Reasoning-effort dial (`low`…`xhigh` | `none`). Honored by runtimes in {@link runtimeHonorsReasoningEffort}. */
export const LOOP_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'none'] as const
export type LoopReasoningEffort = (typeof LOOP_REASONING_EFFORTS)[number]

/** Pi `thinkingLevel` values we map onto. Unset and `none` are both `off` — no hidden default. */
export type PiThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Map loop.json `reasoningEffort` onto Pi thinking. Omit/`none` → off (do not leak the SDK default). */
export function toPiThinkingLevel(effort: LoopReasoningEffort | undefined): PiThinkingLevel {
  switch (effort) {
    case undefined:
    case 'none':
      return 'off'
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return effort
    default: {
      const _exhaustive: never = effort
      return _exhaustive
    }
  }
}

export type ResolvedLoopAgent =
  | {
      runtime: typeof LOOP_RUNTIME_CURSOR
      model: typeof CURSOR_LOOP_MODEL
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CLINE_PASS
      model: ClinePassLoopModel
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CLINE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_OPENCODE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_PI
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CODEX
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_DSH
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_MUSE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }

export function isClineSdkRuntime(
  runtime: LoopRuntime,
): runtime is typeof LOOP_RUNTIME_CLINE_PASS | typeof LOOP_RUNTIME_CLINE {
  return runtime === LOOP_RUNTIME_CLINE_PASS || runtime === LOOP_RUNTIME_CLINE
}

export function isOpencodeRuntime(
  runtime: LoopRuntime,
): runtime is typeof LOOP_RUNTIME_OPENCODE {
  return runtime === LOOP_RUNTIME_OPENCODE
}

export function isPiRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_PI {
  return runtime === LOOP_RUNTIME_PI
}

export function isCodexRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_CODEX {
  return runtime === LOOP_RUNTIME_CODEX
}

export function isDshRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_DSH {
  return runtime === LOOP_RUNTIME_DSH
}

export function isMuseRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_MUSE {
  return runtime === LOOP_RUNTIME_MUSE
}

/**
 * Whether the worker runner actually sends `reasoningEffort` to the provider.
 * Wizard, resolveLoopAgent, and the iteration ladder all use this — do not
 * special-case Cline in those call sites.
 */
export function runtimeHonorsReasoningEffort(runtime: LoopRuntime): boolean {
  switch (runtime) {
    case LOOP_RUNTIME_CLINE:
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_PI:
    case LOOP_RUNTIME_MUSE:
      return true
    case LOOP_RUNTIME_CURSOR:
    case LOOP_RUNTIME_OPENCODE:
    case LOOP_RUNTIME_CODEX:
    case LOOP_RUNTIME_DSH:
      return false
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

export function defaultModelForRuntime(runtime: LoopRuntime): string {
  switch (runtime) {
    case LOOP_RUNTIME_CLINE_PASS:
      return DEFAULT_CLINE_PASS_LOOP_MODEL
    case LOOP_RUNTIME_CLINE:
      return DEFAULT_CLINE_CREDITS_LOOP_MODEL
    case LOOP_RUNTIME_OPENCODE:
      return DEFAULT_OPENCODE_GO_LOOP_MODEL
    case LOOP_RUNTIME_PI:
      return DEFAULT_PI_LOOP_MODEL
    case LOOP_RUNTIME_CODEX:
      return DEFAULT_CODEX_LOOP_MODEL
    case LOOP_RUNTIME_DSH:
      return DEFAULT_DSH_LOOP_MODEL
    case LOOP_RUNTIME_MUSE:
      return DEFAULT_MUSE_LOOP_MODEL
    case LOOP_RUNTIME_CURSOR:
      return CURSOR_LOOP_MODEL
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

export function isCursorReviewModel(model: string): model is CursorReviewModel {
  return (CURSOR_REVIEW_MODELS as readonly string[]).includes(model)
}

export function isCursorSdkModel(model: string): model is CursorSdkModel {
  return model === CURSOR_WORKER_MODEL || isCursorReviewModel(model)
}

export type ResolvedReviewAgent =
  | {
      runtime: typeof LOOP_RUNTIME_CURSOR
      model: CursorSdkModel
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CLINE_PASS
      model: ClinePassLoopModel
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CLINE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_OPENCODE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_PI
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_CODEX
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_DSH
      model: string
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: typeof LOOP_RUNTIME_MUSE
      model: string
      reasoningEffort?: LoopReasoningEffort
    }

function assertCursorReviewModel(model: string, field: string): CursorSdkModel {
  if (!isCursorSdkModel(model)) {
    throw new Error(
      `Unknown ${field} "${model}" for reviewRuntime "cursor". Allowed: ${CURSOR_REVIEW_MODELS.join(', ')}`,
    )
  }
  if (model.toLowerCase().includes('fast')) {
    throw new Error(`${field} "${model}" is banned — do not use Composer Fast for reviews.`)
  }
  return model
}

function assertReviewModelForRuntime(
  runtime: LoopRuntime,
  model: string,
  modelField = 'reviewModel',
  runtimeField = 'reviewRuntime',
): string {
  if (runtime === LOOP_RUNTIME_CURSOR) {
    return assertCursorReviewModel(model, modelField)
  }
  if (runtime === LOOP_RUNTIME_CLINE_PASS) {
    if (!isClinePassModel(model)) {
      throw new Error(
        `Unknown ${modelField} "${model}" for ${runtimeField} "cline-pass". Use a slug from CLINE_PASS_LOOP_MODELS`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_CLINE) {
    if (model.startsWith('cline-pass/')) {
      throw new Error(
        `${modelField} "${model}" is not valid for ${runtimeField} "cline" (credits). ` +
          `Use an OpenRouter-style id such as "${DEFAULT_CLINE_CREDITS_LOOP_MODEL}".`,
      )
    }
    if (!isClineCreditsModelShape(model)) {
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "cline". Expected provider/model ` +
          `(e.g. "${DEFAULT_CLINE_CREDITS_LOOP_MODEL}").`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_OPENCODE) {
    if (!isOpencodeLoopModel(model)) {
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "opencode". Expected provider/model ` +
          `(Go: opencode-go/… from OPENCODE_GO_LOOP_MODELS; BYOK: e.g. openrouter/…, openrouter/…:free, vercel/…, ollama/… — ` +
          `https://opencode.ai/docs/providers/).`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_PI) {
    if (!isPiLoopModel(model)) {
      if (model.startsWith('opencode-go/')) {
        throw new Error(
          `${modelField} "${model}" is not valid for ${runtimeField} "pi". ` +
            `Use BYOK provider/model (e.g. "${DEFAULT_PI_LOOP_MODEL}") or ${runtimeField} "opencode".`,
        )
      }
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "pi". Expected provider/model ` +
          `(e.g. "${DEFAULT_PI_LOOP_MODEL}") — https://pi.dev/docs`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_CODEX) {
    if (!isCodexLoopModel(model)) {
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "codex". Expected a Codex CLI slug ` +
          `(e.g. "${DEFAULT_CODEX_REVIEW_MODEL}") — https://github.com/openai/codex`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_DSH) {
    if (!isDshLoopModel(model)) {
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "dsh". Expected provider/model ` +
          `(e.g. "${DEFAULT_DSH_REVIEW_MODEL}").`,
      )
    }
    return model
  }
  if (runtime === LOOP_RUNTIME_MUSE) {
    if (!isMuseLoopModel(model)) {
      throw new Error(
        `Invalid ${modelField} "${model}" for ${runtimeField} "muse". Expected a Muse Spark slug ` +
          `(e.g. "${DEFAULT_MUSE_REVIEW_MODEL}") — https://dev.meta.ai/docs/muse-code`,
      )
    }
    return model
  }
  const _exhaustive: never = runtime
  return _exhaustive
}

function defaultReviewModel(
  reviewRuntime: LoopRuntime,
  workerRuntime: LoopRuntime,
): string {
  switch (reviewRuntime) {
    case LOOP_RUNTIME_CURSOR:
      return workerRuntime === LOOP_RUNTIME_CURSOR ? CURSOR_REVIEW_MODEL : CURSOR_WORKER_MODEL
    case LOOP_RUNTIME_CODEX:
      return DEFAULT_CODEX_REVIEW_MODEL
    case LOOP_RUNTIME_OPENCODE:
      return DEFAULT_OPENCODE_GO_REVIEW_MODEL
    case LOOP_RUNTIME_DSH:
      return DEFAULT_DSH_REVIEW_MODEL
    case LOOP_RUNTIME_MUSE:
      return DEFAULT_MUSE_REVIEW_MODEL
    case LOOP_RUNTIME_CLINE_PASS:
    case LOOP_RUNTIME_CLINE:
    case LOOP_RUNTIME_PI:
      return defaultModelForRuntime(reviewRuntime)
    default: {
      const _exhaustive: never = reviewRuntime
      return _exhaustive
    }
  }
}

export type ReviewAgentFieldLabels = {
  modelField?: string
  runtimeField?: string
}

/**
 * Resolve the primary judge agent (reviewRuntime + reviewModel).
 * Default reviewRuntime is cursor. OpenCode/Codex judges default to V4 Pro/Sol, not the cheap worker.
 */
export function resolveReviewAgent(
  config: Pick<LoopConfig, 'runtime' | 'reviewRuntime' | 'reviewModel'>,
  labels: ReviewAgentFieldLabels = {},
): ResolvedReviewAgent {
  const modelField = labels.modelField ?? 'reviewModel'
  const runtimeField = labels.runtimeField ?? 'reviewRuntime'
  const workerRuntime = config.runtime ?? LOOP_RUNTIME_CURSOR
  const reviewRuntime = config.reviewRuntime ?? LOOP_RUNTIME_CURSOR
  const model = config.reviewModel
    ? assertReviewModelForRuntime(reviewRuntime, config.reviewModel, modelField, runtimeField)
    : defaultReviewModel(reviewRuntime, workerRuntime)

  if (reviewRuntime === LOOP_RUNTIME_CURSOR) {
    assertCursorSdkModelAllowed(model, 'review')
  } else {
    assertLoopModelAllowed(reviewRuntime, model)
  }

  if (reviewRuntime === LOOP_RUNTIME_CURSOR) {
    return { runtime: reviewRuntime, model: assertCursorReviewModel(model, modelField) }
  }
  if (reviewRuntime === LOOP_RUNTIME_CLINE) {
    return {
      runtime: reviewRuntime,
      model: assertClineCreditsModel(model, 'model'),
    }
  }
  if (reviewRuntime === LOOP_RUNTIME_OPENCODE) {
    return { runtime: reviewRuntime, model: assertOpencodeLoopModel(model, 'model') }
  }
  if (reviewRuntime === LOOP_RUNTIME_PI) {
    return { runtime: reviewRuntime, model: assertPiLoopModel(model, 'model') }
  }
  if (reviewRuntime === LOOP_RUNTIME_CODEX) {
    return { runtime: reviewRuntime, model: assertCodexLoopModel(model, 'model') }
  }
  if (reviewRuntime === LOOP_RUNTIME_DSH) {
    return { runtime: reviewRuntime, model: assertDshLoopModel(model, 'model') }
  }
  if (reviewRuntime === LOOP_RUNTIME_MUSE) {
    return { runtime: reviewRuntime, model: assertMuseLoopModel(model, 'model') }
  }
  return {
    runtime: LOOP_RUNTIME_CLINE_PASS,
    model: assertClinePassModel(model, 'model'),
  }
}

/**
 * Cursor SDK model for quality review when reviewRuntime is cursor (default).
 * @deprecated Prefer {@link resolveReviewAgent} when reviewRuntime may be non-cursor.
 */
export function resolveReviewModel(
  config: Pick<LoopConfig, 'runtime' | 'reviewRuntime' | 'reviewModel'>,
): CursorSdkModel {
  const agent = resolveReviewAgent(config)
  if (agent.runtime !== LOOP_RUNTIME_CURSOR) {
    throw new Error(
      `resolveReviewModel requires reviewRuntime "cursor" (got "${agent.runtime}"). Use resolveReviewAgent().`,
    )
  }
  return agent.model
}

export function isClinePassModel(model: string): model is ClinePassLoopModel {
  return (CLINE_PASS_LOOP_MODELS as readonly string[]).includes(model)
}

export function isOpencodeGoModel(model: string): model is OpencodeGoLoopModel {
  return (OPENCODE_GO_LOOP_MODELS as readonly string[]).includes(model)
}

export function isClineCreditsModelShape(model: string): boolean {
  return CLINE_CREDITS_MODEL_RE.test(model) && !model.startsWith('cline-pass/')
}

/** OpenCode / Pi `provider/model` shape (BYOK). Go slugs use a separate curated list. */
const OPENCODE_BYOK_MODEL_RE =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/:-]*$/

/** Split `provider/model` (OpenCode / Pi) for the SDK prompt body. */
export function parseProviderModel(model: string): {
  providerID: string
  modelID: string
} {
  const slash = model.indexOf('/')
  if (slash <= 0 || slash === model.length - 1) {
    throw new Error(
      `Invalid provider/model "${model}". Expected provider/model ` +
        `(e.g. "${DEFAULT_OPENCODE_GO_LOOP_MODEL}" or "openrouter/deepseek/deepseek-chat"). ` +
        `See https://opencode.ai/docs/providers/`,
    )
  }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

/** @deprecated Use {@link parseProviderModel}. */
export const parseOpencodeModel = parseProviderModel

/** @deprecated Use {@link parseProviderModel}. */
export const parseOpencodeGoModel = parseProviderModel

export function isOpencodeLoopModelShape(model: string): boolean {
  if (!OPENCODE_BYOK_MODEL_RE.test(model)) return false
  if (model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `pi` (BYOK; excludes opencode-go gateway slugs). */
export function isPiLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  if (model.startsWith('opencode-go/') || model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `codex` (Codex CLI slug). */
export function isCodexLoopModel(model: string): boolean {
  if (!CODEX_MODEL_RE.test(model)) return false
  if (model.includes('/')) return false
  if (model.toLowerCase().includes('fast')) return false
  return true
}

/** Valid `loop.json` model for runtime `dsh` (`provider/model` for headless agent-default-model). */
export function isDshLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  if (model.startsWith('opencode-go/') || model.startsWith('cline-pass/')) return false
  return true
}

/** Valid `loop.json` model for runtime `muse` (Muse Spark slug). */
export function isMuseLoopModel(model: string): boolean {
  if (!MUSE_MODEL_RE.test(model)) return false
  if (model.includes('/')) return false
  if (model.toLowerCase().includes('fast')) return false
  return true
}

/** Valid `loop.json` model for runtime `opencode`. */
export function isOpencodeLoopModel(model: string): boolean {
  if (!isOpencodeLoopModelShape(model)) return false
  const { providerID } = parseProviderModel(model)
  if (providerID === 'opencode-go') return isOpencodeGoModel(model)
  return true
}

export function modelCompatibleWithRuntime(
  runtime: LoopRuntime,
  model: string | undefined,
): boolean {
  if (model === undefined) return true
  switch (runtime) {
    case LOOP_RUNTIME_CURSOR:
      return model === CURSOR_LOOP_MODEL
    case LOOP_RUNTIME_CLINE_PASS:
      return isClinePassModel(model)
    case LOOP_RUNTIME_CLINE:
      return isClineCreditsModelShape(model)
    case LOOP_RUNTIME_OPENCODE:
      return isOpencodeLoopModel(model)
    case LOOP_RUNTIME_PI:
      return isPiLoopModel(model)
    case LOOP_RUNTIME_CODEX:
      return isCodexLoopModel(model)
    case LOOP_RUNTIME_DSH:
      return isDshLoopModel(model)
    case LOOP_RUNTIME_MUSE:
      return isMuseLoopModel(model)
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

/** Judge models: cursor allows Grok + Composer; other runtimes match worker shape. */
export function reviewModelCompatibleWithRuntime(
  runtime: LoopRuntime,
  model: string | undefined,
): boolean {
  if (model === undefined) return true
  if (runtime === LOOP_RUNTIME_CURSOR) {
    return isCursorSdkModel(model) && !model.toLowerCase().includes('fast')
  }
  return modelCompatibleWithRuntime(runtime, model)
}

/**
 * When `runtime` changes without an explicit model/escalateModel override, drop
 * leftover ids from the previous provider so parse uses the new runtime defaults
 * instead of throwing. Returns stderr-ready warning lines.
 */
export function clearIncompatibleAgentFieldsOnRuntimeSwitch(input: {
  previousRuntime: LoopRuntime
  nextRuntime: LoopRuntime
  model?: string
  escalateModel?: string
  modelOverridden: boolean
  escalateModelOverridden: boolean
}): {
  model?: string
  escalateModel?: string
  warnings: string[]
} {
  const { previousRuntime, nextRuntime } = input
  if (previousRuntime === nextRuntime) {
    return {
      model: input.model,
      escalateModel: input.escalateModel,
      warnings: [],
    }
  }

  const warnings: string[] = []
  let model = input.model
  let escalateModel = input.escalateModel

  if (!input.modelOverridden && model !== undefined && !modelCompatibleWithRuntime(nextRuntime, model)) {
    warnings.push(
      `cleared model "${model}" after switching runtime ${previousRuntime} → ${nextRuntime}; ` +
        `using default "${defaultModelForRuntime(nextRuntime)}". Pass --model to set an explicit id.`,
    )
    model = undefined
  }

  if (
    !input.escalateModelOverridden &&
    escalateModel !== undefined &&
    !modelCompatibleWithRuntime(nextRuntime, escalateModel)
  ) {
    warnings.push(
      `cleared escalateModel "${escalateModel}" after switching runtime ${previousRuntime} → ${nextRuntime}. ` +
        `Pass --escalate-model if you still want escalation on ${nextRuntime}.`,
    )
    escalateModel = undefined
  }

  return { model, escalateModel, warnings }
}

/**
 * When `reviewRuntime` changes without an explicit reviewModel override, drop
 * leftover judge ids from the previous provider so parse uses the new defaults.
 */
export function clearIncompatibleReviewFieldsOnRuntimeSwitch(input: {
  previousReviewRuntime: LoopRuntime
  nextReviewRuntime: LoopRuntime
  reviewModel?: string
  reviewModelOverridden: boolean
  runtimeField?: string
  modelField?: string
}): {
  reviewModel?: string
  warnings: string[]
} {
  const { previousReviewRuntime, nextReviewRuntime } = input
  const runtimeField = input.runtimeField ?? 'reviewRuntime'
  const modelField = input.modelField ?? 'reviewModel'
  if (previousReviewRuntime === nextReviewRuntime) {
    return { reviewModel: input.reviewModel, warnings: [] }
  }

  const warnings: string[] = []
  let reviewModel = input.reviewModel

  if (
    !input.reviewModelOverridden &&
    reviewModel !== undefined &&
    !reviewModelCompatibleWithRuntime(nextReviewRuntime, reviewModel)
  ) {
    warnings.push(
      `cleared ${modelField} "${reviewModel}" after switching ${runtimeField} ${previousReviewRuntime} → ${nextReviewRuntime}; ` +
        `using default judge model for ${nextReviewRuntime}. Pass --${modelField.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)} to set an explicit id.`,
    )
    reviewModel = undefined
  }

  return { reviewModel, warnings }
}

function assertClinePassModel(model: string, field: 'model' | 'escalateModel'): ClinePassLoopModel {
  if (!isClinePassModel(model)) {
    throw new Error(
      `Unknown ClinePass ${field} "${model}". Use a slug from CLINE_PASS_LOOP_MODELS`,
    )
  }
  return model
}

function assertClineCreditsModel(model: string, field: 'model' | 'escalateModel'): string {
  if (model.startsWith('cline-pass/')) {
    throw new Error(
      `ClinePass slug "${model}" is not valid for runtime "cline" (credits). ` +
        `Use an OpenRouter-style id such as "${DEFAULT_CLINE_CREDITS_LOOP_MODEL}" ` +
        `(see https://docs.cline.bot/api/models).`,
    )
  }
  if (!isClineCreditsModelShape(model)) {
    throw new Error(
      `Invalid Cline credits ${field} "${model}". Expected provider/model ` +
        `(e.g. "${DEFAULT_CLINE_CREDITS_LOOP_MODEL}").`,
    )
  }
  return model
}

function assertPiLoopModel(model: string, field: 'model' | 'escalateModel'): string {
  if (!isPiLoopModel(model)) {
    if (model.startsWith('opencode-go/')) {
      throw new Error(
        `OpenCode Go slug "${model}" is not valid for runtime "pi". ` +
          `Use BYOK provider/model (e.g. "${DEFAULT_PI_LOOP_MODEL}") or runtime "opencode".`,
      )
    }
    throw new Error(
      `Invalid Pi ${field} "${model}". Expected provider/model ` +
        `(e.g. "${DEFAULT_PI_LOOP_MODEL}") — https://pi.dev/docs`,
    )
  }
  return model
}

function assertCodexLoopModel(model: string, field: 'model' | 'escalateModel'): string {
  if (!isCodexLoopModel(model)) {
    throw new Error(
      `Invalid Codex ${field} "${model}". Expected a Codex CLI slug ` +
        `(e.g. "${DEFAULT_CODEX_LOOP_MODEL}") — https://github.com/openai/codex`,
    )
  }
  return model
}

function assertDshLoopModel(model: string, field: 'model' | 'escalateModel'): string {
  if (!isDshLoopModel(model)) {
    throw new Error(
      `Invalid DSH ${field} "${model}". Expected provider/model ` +
        `(e.g. "${DEFAULT_DSH_LOOP_MODEL}") for headless agent-default-model.`,
    )
  }
  return model
}

function assertMuseLoopModel(model: string, field: 'model' | 'escalateModel'): string {
  if (!isMuseLoopModel(model)) {
    throw new Error(
      `Invalid Muse ${field} "${model}". Expected a Muse Spark slug ` +
        `(e.g. "${DEFAULT_MUSE_LOOP_MODEL}") — https://dev.meta.ai/docs/muse-code`,
    )
  }
  return model
}

function assertOpencodeLoopModel(model: string, field: 'model' | 'escalateModel'): string {
  if (!isOpencodeLoopModel(model)) {
    const { providerID } = (() => {
      try {
        return parseProviderModel(model)
      } catch {
        return { providerID: '' }
      }
    })()
    if (providerID === 'opencode-go') {
      throw new Error(
        `Unknown OpenCode Go ${field} "${model}". Use a slug from OPENCODE_GO_LOOP_MODELS ` +
          `(see https://opencode.ai/docs/go/).`,
      )
    }
    throw new Error(
      `Invalid OpenCode ${field} "${model}". Expected provider/model ` +
        `(Go: opencode-go/… from OPENCODE_GO_LOOP_MODELS; BYOK: e.g. openrouter/…, openrouter/…:free, vercel/…, ollama/… — ` +
        `https://opencode.ai/docs/providers/).`,
    )
  }
  return model
}

export function resolveLoopAgent(config: LoopConfig): ResolvedLoopAgent {
  const runtime = config.runtime ?? LOOP_RUNTIME_CURSOR
  const model = config.model ?? defaultModelForRuntime(runtime)
  assertLoopModelAllowed(runtime, model)

  if (runtime === LOOP_RUNTIME_CURSOR) {
    return { runtime, model: CURSOR_LOOP_MODEL }
  }

  if (runtime === LOOP_RUNTIME_CLINE) {
    return {
      runtime,
      model: assertClineCreditsModel(model, 'model'),
      reasoningEffort: config.reasoningEffort,
    }
  }

  if (runtime === LOOP_RUNTIME_OPENCODE) {
    return {
      runtime,
      model: assertOpencodeLoopModel(model, 'model'),
    }
  }

  if (runtime === LOOP_RUNTIME_PI) {
    return {
      runtime,
      model: assertPiLoopModel(model, 'model'),
      reasoningEffort: config.reasoningEffort,
    }
  }

  if (runtime === LOOP_RUNTIME_CODEX) {
    return {
      runtime,
      model: assertCodexLoopModel(model, 'model'),
    }
  }

  if (runtime === LOOP_RUNTIME_DSH) {
    return {
      runtime,
      model: assertDshLoopModel(model, 'model'),
    }
  }

  if (runtime === LOOP_RUNTIME_MUSE) {
    return {
      runtime,
      model: assertMuseLoopModel(model, 'model'),
      reasoningEffort: config.reasoningEffort,
    }
  }

  return {
    runtime,
    model: assertClinePassModel(model, 'model'),
    reasoningEffort: config.reasoningEffort,
  }
}

export type SecondaryReviewRuntime = LoopRuntime
export type ResolvedSecondaryReviewAgent = ResolvedReviewAgent

/**
 * Resolve optional second residual judge. Unset reviewSecondaryRuntime → disabled.
 * Same runtimes and default models as the primary judge (`resolveReviewAgent`).
 */
export function resolveSecondaryReviewAgent(
  config: Partial<Pick<LoopConfig, 'runtime' | 'reviewSecondaryRuntime' | 'reviewSecondaryModel'>>,
): ResolvedSecondaryReviewAgent | undefined {
  if (!config.reviewSecondaryRuntime) return undefined
  return resolveReviewAgent(
    {
      runtime: config.runtime ?? LOOP_RUNTIME_CURSOR,
      reviewRuntime: config.reviewSecondaryRuntime,
      reviewModel: config.reviewSecondaryModel,
    },
    { modelField: 'reviewSecondaryModel', runtimeField: 'reviewSecondaryRuntime' },
  )
}

/** Parse-time validation for loop.json (model + escalateModel + review agent). */
export function validateLoopAgentConfig(config: LoopConfig): void {
  resolveLoopAgent(config)
  resolveReviewAgent(config)
  resolveSecondaryReviewAgent(config)

  if (!config.escalateModel) return

  const runtime = config.runtime ?? LOOP_RUNTIME_CURSOR
  if (runtime === LOOP_RUNTIME_CLINE_PASS) {
    assertClinePassModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_CLINE) {
    assertClineCreditsModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_OPENCODE) {
    assertOpencodeLoopModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_PI) {
    assertPiLoopModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_CODEX) {
    assertCodexLoopModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_DSH) {
    assertDshLoopModel(config.escalateModel, 'escalateModel')
    return
  }

  if (runtime === LOOP_RUNTIME_MUSE) {
    assertMuseLoopModel(config.escalateModel, 'escalateModel')
    return
  }

  if (config.escalateModel !== CURSOR_LOOP_MODEL) {
    throw new Error(
      `escalateModel is only used with runtime "cline-pass", "cline", "opencode", "pi", "codex", "dsh", or "muse" ` +
        `(got runtime "cursor" and escalateModel "${config.escalateModel}")`,
    )
  }
}

/** Ordered reasoning tiers used for gradual escalation (excludes 'none'). */
const REASONING_LADDER = ['low', 'medium', 'high', 'xhigh'] as const
type ReasoningLadderTier = (typeof REASONING_LADDER)[number]

function ladderIndex(effort: LoopReasoningEffort | undefined): number {
  if (effort === undefined || effort === 'none') return -1
  return (REASONING_LADDER as readonly string[]).indexOf(effort)
}

/**
 * Resolve the reasoning tier for a given iteration by stepping up the ladder from the
 * base tier toward the ceiling. Steps once per iteration (after iteration 1) by
 * `step` tiers, capped at the ceiling. Driven by iteration count — not by identical
 * failure signature — so it climbs reliably even when cranking effort changes the
 * agent's approach (and thus the verifier output).
 */
function resolveReasoningTier(
  base: LoopReasoningEffort | undefined,
  ceiling: LoopReasoningEffort | undefined,
  step: number,
  iteration: number,
  /**
   * Extra reasoning-tier steps for BLOCKERS-driven fix rounds. Added on top of the
   * iteration-climb below, so a fix round can jump up to `step` extra tiers at once
   * (e.g. iteration 2 + 1 fix round = +2). Bounded by the ceiling.
   */
  reviewCycleEscalation = 0,
): LoopReasoningEffort | undefined {
  const baseIdx = ladderIndex(base)
  if (baseIdx < 0) return base
  const ceilIdx = ladderIndex(ceiling) < 0 ? baseIdx : ladderIndex(ceiling)
  // Iteration climb + review-cycle fix-round steps compound; a fix round may jump
  // multiple tiers at once, capped by the ceiling.
  const ticks = Math.max(0, iteration - 1) + Math.max(0, reviewCycleEscalation)
  const idx = Math.min(ceilIdx, baseIdx + step * ticks)
  return REASONING_LADDER[idx] as ReasoningLadderTier
}

export function resolveIterationAgent(
  config: LoopConfig,
  iteration: number,
  escalationRepeatCount: number | undefined,
  reviewCycleEscalation = 0,
  escalateForWorkerFault = false,
): ResolvedLoopAgent {
  const base = resolveLoopAgent(config)
  if (base.runtime === LOOP_RUNTIME_CURSOR) {
    return base
  }

  if (runtimeHonorsReasoningEffort(base.runtime)) {
    const step = config.reasoningEscalationStep ?? 1
    const tier = resolveReasoningTier(
      config.reasoningEffort,
      config.escalateReasoningEffort,
      step,
      iteration,
      reviewCycleEscalation,
    )

    let agent: ResolvedLoopAgent = { ...base, reasoningEffort: tier }

    // Model switch (expensive lever) is sequenced AFTER the cheap lever is exhausted:
    // only once reasoning has reached its ceiling AND hard stagnation (identical
    // consecutive verifier failures) persists past the threshold. When no reasoning
    // ladder is configured, model escalation keeps its prior stagnation-gated behavior.
    // A hung/timed-out worker skips that gate — repeating the same dead model is
    // not a reasoning problem.
    const reasoningConfigured =
      config.reasoningEffort !== undefined && config.reasoningEffort !== 'none'
    const atCeiling =
      !reasoningConfigured || tier === (config.escalateReasoningEffort ?? tier)
    const threshold = config.escalateAfterStagnation ?? 2
    const switchForStagnation =
      atCeiling &&
      escalationRepeatCount !== undefined &&
      escalationRepeatCount >= threshold

    if (config.escalateModel && (escalateForWorkerFault || switchForStagnation)) {
      assertLoopModelAllowed(base.runtime, config.escalateModel)
      const reasoningEffort = config.escalateModelReasoningEffort ?? tier
      agent = {
        ...resolveLoopAgent({ ...config, model: config.escalateModel }),
        reasoningEffort,
      }
    }

    return agent
  }

  const threshold = config.escalateAfterStagnation ?? 2
  const switchModel =
    config.escalateModel &&
    (escalateForWorkerFault ||
      (escalationRepeatCount !== undefined && escalationRepeatCount >= threshold))
      ? config.escalateModel
      : undefined
  if (switchModel) {
    assertLoopModelAllowed(base.runtime, switchModel)
    return resolveLoopAgent({ ...config, model: switchModel })
  }
  return base
}

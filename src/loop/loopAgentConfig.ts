import type { LoopConfig } from '../loop/loopConfig.js'
import { assertLoopModelAllowed } from '../usage/modelPolicy.js'

export const LOOP_RUNTIME_CURSOR = 'cursor' as const
export const LOOP_RUNTIME_CLINE_PASS = 'cline-pass' as const
/** Cline usage-billing (pay-as-you-go credits). Same SDK/API key as ClinePass. */
export const LOOP_RUNTIME_CLINE = 'cline' as const
/** OpenCode worker (`provider/model` — Go subscription, OpenRouter BYOK, Ollama, …). */
export const LOOP_RUNTIME_OPENCODE = 'opencode' as const
/** Pi coding agent (`@earendil-works/pi-coding-agent`) — BYOK `provider/model` (not opencode-go). */
export const LOOP_RUNTIME_PI = 'pi' as const

export type LoopRuntime =
  | typeof LOOP_RUNTIME_CURSOR
  | typeof LOOP_RUNTIME_CLINE_PASS
  | typeof LOOP_RUNTIME_CLINE
  | typeof LOOP_RUNTIME_OPENCODE
  | typeof LOOP_RUNTIME_PI

export const CURSOR_LOOP_MODEL = 'composer-2.5' as const
/** Alias — Cursor SDK worker for implement iterations (never Composer Fast). */
export const CURSOR_WORKER_MODEL = CURSOR_LOOP_MODEL
/**
 * Cursor SDK judge for post-loop / review-gate runs.
 * Confirm via `Cursor.models.list()` if your account uses a different id.
 */
export const CURSOR_REVIEW_MODEL = 'grok-4.5' as const

export const CURSOR_REVIEW_MODELS = [CURSOR_REVIEW_MODEL, CURSOR_WORKER_MODEL] as const
export type CursorReviewModel = (typeof CURSOR_REVIEW_MODELS)[number]
export type CursorSdkModel = typeof CURSOR_WORKER_MODEL | CursorReviewModel

/** Canonical slugs — https://docs.cline.bot/getting-started/clinepass */
export const CLINE_PASS_LOOP_MODELS = [
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/minimax-m3',
  'cline-pass/qwen3.7-plus',
  'cline-pass/kimi-k2.7-code',
  'cline-pass/deepseek-v4-pro',
  'cline-pass/glm-5.2',
  'cline-pass/kimi-k2.6',
  'cline-pass/mimo-v2.5-pro',
  'cline-pass/qwen3.7-max',
] as const

export type ClinePassLoopModel = (typeof CLINE_PASS_LOOP_MODELS)[number]

export const DEFAULT_CLINE_PASS_LOOP_MODEL: ClinePassLoopModel = 'cline-pass/deepseek-v4-flash'
export const DEFAULT_CLINE_PASS_ESCALATE_MODEL: ClinePassLoopModel = 'cline-pass/qwen3.7-plus'

/** Default OpenRouter-style id for Cline credits (usage-billing). https://docs.cline.bot/api/models */
export const DEFAULT_CLINE_CREDITS_LOOP_MODEL = 'deepseek/deepseek-chat'
/** Mid-tier escalate recommendation for credits (cheaper than Sonnet for loop cost discipline). */
export const DEFAULT_CLINE_CREDITS_ESCALATE_MODEL = 'google/gemini-2.5-pro'

/**
 * OpenCode Go curated slugs — https://opencode.ai/docs/go/
 * Format: `opencode-go/<modelID>` (providerID `opencode-go`).
 */
export const OPENCODE_GO_LOOP_MODELS = [
  'opencode-go/deepseek-v4-flash',
  'opencode-go/mimo-v2.5',
  'opencode-go/minimax-m3',
  'opencode-go/qwen3.7-plus',
  'opencode-go/kimi-k2.7-code',
  'opencode-go/deepseek-v4-pro',
  'opencode-go/glm-5.2',
  'opencode-go/kimi-k2.6',
  'opencode-go/mimo-v2.5-pro',
  'opencode-go/qwen3.7-max',
  'opencode-go/gpt-5.6-luna',
  'opencode-go/grok-4.5',
] as const

export type OpencodeGoLoopModel = (typeof OPENCODE_GO_LOOP_MODELS)[number]

export const DEFAULT_OPENCODE_GO_LOOP_MODEL: OpencodeGoLoopModel = 'opencode-go/deepseek-v4-flash'
export const DEFAULT_OPENCODE_GO_ESCALATE_MODEL: OpencodeGoLoopModel = 'opencode-go/qwen3.7-plus'

/** Default Pi worker — OpenRouter DeepSeek (same shape as Cline credits). */
export const DEFAULT_PI_LOOP_MODEL = 'openrouter/deepseek/deepseek-chat'
export const DEFAULT_PI_ESCALATE_MODEL = 'openrouter/google/gemini-2.5-flash'

/** OpenRouter-style `provider/model` (Cline usage-billing / API). */
const CLINE_CREDITS_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

/** Reasoning-effort dial for Cline SDK models (mirrors @cline/core ProviderConfig.reasoningEffort). */
export const LOOP_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'none'] as const
export type LoopReasoningEffort = (typeof LOOP_REASONING_EFFORTS)[number]

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

/**
 * Resolve the Cursor SDK model used for quality review / review-gate.
 * Cursor-only loops default to Grok 4.5 as judge; Cline workers keep Composer
 * as the review fallback unless `reviewModel` is set explicitly.
 */
export function resolveReviewModel(config: Pick<LoopConfig, 'runtime' | 'reviewModel'>): CursorSdkModel {
  if (config.reviewModel) {
    if (!isCursorSdkModel(config.reviewModel)) {
      throw new Error(
        `Unknown reviewModel "${config.reviewModel}". Allowed: ${CURSOR_REVIEW_MODELS.join(', ')}`,
      )
    }
    if (config.reviewModel.toLowerCase().includes('fast')) {
      throw new Error(`reviewModel "${config.reviewModel}" is banned — do not use Composer Fast for reviews.`)
    }
    return config.reviewModel
  }

  const runtime = config.runtime ?? LOOP_RUNTIME_CURSOR
  return runtime === LOOP_RUNTIME_CURSOR ? CURSOR_REVIEW_MODEL : CURSOR_WORKER_MODEL
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
const OPENCODE_BYOK_MODEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._/-]*$/

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
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
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
        `(Go: opencode-go/… from OPENCODE_GO_LOOP_MODELS; BYOK: e.g. openrouter/…, ollama/… — ` +
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
    return { runtime, model: CURSOR_LOOP_MODEL, reasoningEffort: config.reasoningEffort }
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
    }
  }

  return {
    runtime,
    model: assertClinePassModel(model, 'model'),
    reasoningEffort: config.reasoningEffort,
  }
}

export type SecondaryReviewRuntime =
  | typeof LOOP_RUNTIME_CLINE_PASS
  | typeof LOOP_RUNTIME_CLINE

export type ResolvedSecondaryReviewAgent = {
  runtime: SecondaryReviewRuntime
  model: string
}

/**
 * Resolve optional second-family review agent (M3). Unset reviewSecondaryRuntime → disabled.
 */
export function resolveSecondaryReviewAgent(
  config: Pick<LoopConfig, 'reviewSecondaryRuntime' | 'reviewSecondaryModel'>,
): ResolvedSecondaryReviewAgent | undefined {
  if (!config.reviewSecondaryRuntime) return undefined

  const runtime = config.reviewSecondaryRuntime
  const model = config.reviewSecondaryModel ?? defaultModelForRuntime(runtime)
  assertLoopModelAllowed(runtime, model)

  if (runtime === LOOP_RUNTIME_CLINE_PASS) {
    return { runtime, model: assertClinePassModel(model, 'model') }
  }

  return { runtime, model: assertClineCreditsModel(model, 'model') }
}

/** Parse-time validation for loop.json (model + escalateModel + reviewModel). */
export function validateLoopAgentConfig(config: LoopConfig): void {
  resolveLoopAgent(config)
  resolveReviewModel(config)
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

  if (config.escalateModel !== CURSOR_LOOP_MODEL) {
    throw new Error(
      `escalateModel is only used with runtime "cline-pass", "cline", "opencode", or "pi" ` +
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
): ResolvedLoopAgent {
  const base = resolveLoopAgent(config)
  if (base.runtime === LOOP_RUNTIME_CURSOR) {
    return base
  }

  if (isOpencodeRuntime(base.runtime)) {
    const threshold = config.escalateAfterStagnation ?? 2
    if (
      config.escalateModel &&
      escalationRepeatCount !== undefined &&
      escalationRepeatCount >= threshold
    ) {
      assertLoopModelAllowed(base.runtime, config.escalateModel)
      return {
        runtime: LOOP_RUNTIME_OPENCODE,
        model: assertOpencodeLoopModel(config.escalateModel, 'escalateModel'),
      }
    }
    return {
      runtime: LOOP_RUNTIME_OPENCODE,
      model: assertOpencodeLoopModel(base.model, 'model'),
    }
  }

  if (isPiRuntime(base.runtime)) {
    const threshold = config.escalateAfterStagnation ?? 2
    if (
      config.escalateModel &&
      escalationRepeatCount !== undefined &&
      escalationRepeatCount >= threshold
    ) {
      assertLoopModelAllowed(base.runtime, config.escalateModel)
      return {
        runtime: LOOP_RUNTIME_PI,
        model: assertPiLoopModel(config.escalateModel, 'escalateModel'),
      }
    }
    return {
      runtime: LOOP_RUNTIME_PI,
      model: assertPiLoopModel(base.model, 'model'),
    }
  }

  if (!isClineSdkRuntime(base.runtime)) {
    return base
  }

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
  const reasoningConfigured =
    config.reasoningEffort !== undefined && config.reasoningEffort !== 'none'
  const atCeiling =
    !reasoningConfigured || tier === (config.escalateReasoningEffort ?? tier)
  const threshold = config.escalateAfterStagnation ?? 2

  if (
    config.escalateModel &&
    atCeiling &&
    escalationRepeatCount !== undefined &&
    escalationRepeatCount >= threshold
  ) {
    assertLoopModelAllowed(base.runtime, config.escalateModel)
    const reasoningEffort = config.escalateModelReasoningEffort ?? tier
    if (base.runtime === LOOP_RUNTIME_CLINE) {
      agent = {
        runtime: LOOP_RUNTIME_CLINE,
        model: assertClineCreditsModel(config.escalateModel, 'escalateModel'),
        reasoningEffort,
      }
    } else {
      agent = {
        runtime: LOOP_RUNTIME_CLINE_PASS,
        model: assertClinePassModel(config.escalateModel, 'escalateModel'),
        reasoningEffort,
      }
    }
  }

  return agent
}

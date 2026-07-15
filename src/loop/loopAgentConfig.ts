import type { LoopConfig } from '../loop/loopConfig.js'
import { assertLoopModelAllowed } from '../usage/modelPolicy.js'

export const LOOP_RUNTIME_CURSOR = 'cursor' as const
export const LOOP_RUNTIME_CLINE_PASS = 'cline-pass' as const
/** Cline usage-billing (pay-as-you-go credits). Same SDK/API key as ClinePass. */
export const LOOP_RUNTIME_CLINE = 'cline' as const

export type LoopRuntime =
  | typeof LOOP_RUNTIME_CURSOR
  | typeof LOOP_RUNTIME_CLINE_PASS
  | typeof LOOP_RUNTIME_CLINE

export const CURSOR_LOOP_MODEL = 'composer-2.5' as const

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

export function isClineSdkRuntime(
  runtime: LoopRuntime,
): runtime is typeof LOOP_RUNTIME_CLINE_PASS | typeof LOOP_RUNTIME_CLINE {
  return runtime === LOOP_RUNTIME_CLINE_PASS || runtime === LOOP_RUNTIME_CLINE
}

export function defaultModelForRuntime(runtime: LoopRuntime): string {
  switch (runtime) {
    case LOOP_RUNTIME_CLINE_PASS:
      return DEFAULT_CLINE_PASS_LOOP_MODEL
    case LOOP_RUNTIME_CLINE:
      return DEFAULT_CLINE_CREDITS_LOOP_MODEL
    case LOOP_RUNTIME_CURSOR:
      return CURSOR_LOOP_MODEL
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

export function isClinePassModel(model: string): model is ClinePassLoopModel {
  return (CLINE_PASS_LOOP_MODELS as readonly string[]).includes(model)
}

export function isClineCreditsModelShape(model: string): boolean {
  return CLINE_CREDITS_MODEL_RE.test(model) && !model.startsWith('cline-pass/')
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

  return {
    runtime,
    model: assertClinePassModel(model, 'model'),
    reasoningEffort: config.reasoningEffort,
  }
}

/** Parse-time validation for loop.json (model + escalateModel). */
export function validateLoopAgentConfig(config: LoopConfig): void {
  resolveLoopAgent(config)

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

  if (config.escalateModel !== CURSOR_LOOP_MODEL) {
    throw new Error(
      `escalateModel is only used with runtime "cline-pass" or "cline" ` +
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

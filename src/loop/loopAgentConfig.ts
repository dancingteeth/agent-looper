import type { LoopConfig } from '../loop/loopConfig.js'
import { assertLoopModelAllowed } from '../usage/modelPolicy.js'
import { isPricedLoopModel } from '../usage/loopUsage.js'
import {
  CURSOR_LOOP_MODEL,
  isCursorSdkModel,
  LOOP_RUNTIME_CLAUDE,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type CursorSdkModel,
  type LoopReasoningEffort,
  type LoopRuntime,
  type NonCursorLoopRuntime,
} from './modelCatalog.js'
import {
  AgentModelError,
  assertRuntimeModel,
  defaultModelForRuntime,
  defaultReviewModel,
  modelCompatibleWithRuntime,
  reviewModelCompatibleWithRuntime,
  runtimeHonorsReasoningEffort,
  type AgentModelField,
} from './runtimeSpec.js'

// Catalog + spec are the source of truth; re-exported so existing imports keep one entry point.
export * from './modelCatalog.js'
export * from './runtimeSpec.js'

type ResolvedAgentOf<CursorModel extends string> =
  | {
      runtime: typeof LOOP_RUNTIME_CURSOR
      model: CursorModel
      reasoningEffort?: LoopReasoningEffort
    }
  | {
      runtime: NonCursorLoopRuntime
      model: string
      reasoningEffort?: LoopReasoningEffort
    }

/** Worker agent — Cursor is pinned to Composer; every other runtime carries a validated slug. */
export type ResolvedLoopAgent = ResolvedAgentOf<typeof CURSOR_LOOP_MODEL>
/** Judge agent — Cursor allows Grok + Composer. */
export type ResolvedReviewAgent = ResolvedAgentOf<CursorSdkModel>
export type SecondaryReviewRuntime = LoopRuntime
export type ResolvedSecondaryReviewAgent = ResolvedReviewAgent

export function isClineSdkRuntime(
  runtime: LoopRuntime,
): runtime is typeof LOOP_RUNTIME_CLINE_PASS | typeof LOOP_RUNTIME_CLINE {
  return runtime === LOOP_RUNTIME_CLINE_PASS || runtime === LOOP_RUNTIME_CLINE
}

export function isOpencodeRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_OPENCODE {
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

export function isClaudeRuntime(runtime: LoopRuntime): runtime is typeof LOOP_RUNTIME_CLAUDE {
  return runtime === LOOP_RUNTIME_CLAUDE
}

function withReasoning<T extends { runtime: LoopRuntime }>(
  agent: T,
  reasoningEffort: LoopReasoningEffort | undefined,
): T & { reasoningEffort?: LoopReasoningEffort } {
  if (!runtimeHonorsReasoningEffort(agent.runtime) || reasoningEffort === undefined) return agent
  return { ...agent, reasoningEffort }
}

export function resolveLoopAgent(config: LoopConfig): ResolvedLoopAgent {
  const runtime = config.runtime ?? LOOP_RUNTIME_CURSOR
  const model = config.model ?? defaultModelForRuntime(runtime)
  assertLoopModelAllowed(runtime, model)
  assertRuntimeModel(runtime, model, 'worker', 'model')
  if (runtime === LOOP_RUNTIME_CURSOR) {
    return { runtime, model: CURSOR_LOOP_MODEL }
  }
  return withReasoning({ runtime, model }, config.reasoningEffort)
}

export type ReviewAgentFieldLabels = {
  modelField?: Extract<AgentModelField, 'reviewModel' | 'reviewSecondaryModel'>
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
  const model = assertRuntimeModel(
    reviewRuntime,
    config.reviewModel ?? defaultReviewModel(reviewRuntime, workerRuntime),
    'review',
    modelField,
    runtimeField,
  )

  if (reviewRuntime === LOOP_RUNTIME_CURSOR) {
    // assertRuntimeModel already enforced the Cursor judge shape; this guard only narrows the type.
    if (!isCursorSdkModel(model)) {
      throw new Error(`Cursor review model "${model}" is not a known Cursor SDK id`)
    }
    return { runtime: reviewRuntime, model }
  }
  assertLoopModelAllowed(reviewRuntime, model)
  return { runtime: reviewRuntime, model }
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

/** Parse-time validation for loop.json (model + escalateModel + review agents). */
export function validateLoopAgentConfig(config: LoopConfig): void {
  const worker = resolveLoopAgent(config)
  resolveReviewAgent(config)
  resolveSecondaryReviewAgent(config)
  if (config.escalateModel) {
    assertRuntimeModel(config.runtime ?? LOOP_RUNTIME_CURSOR, config.escalateModel, 'worker', 'escalateModel')
  }
  if (config.maxCostUsd !== undefined) {
    if (!isPricedLoopModel(worker.model)) {
      throw new AgentModelError(
        `maxCostUsd is set but model "${worker.model}" has no pricing row — the budget cap cannot be enforced. Use a catalogued slug or drop maxCostUsd.`,
        'model',
      )
    }
    if (config.escalateModel && !isPricedLoopModel(config.escalateModel)) {
      throw new AgentModelError(
        `maxCostUsd is set but model "${config.escalateModel}" has no pricing row — the budget cap cannot be enforced. Use a catalogued slug or drop maxCostUsd.`,
        'escalateModel',
      )
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

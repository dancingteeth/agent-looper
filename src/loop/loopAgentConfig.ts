import type { RepoContext } from '../context/repoContext.js'
import type { LoopConfig } from '../loop/loopConfig.js'

export const LOOP_RUNTIME_CURSOR = 'cursor' as const
export const LOOP_RUNTIME_CLINE_PASS = 'cline-pass' as const

export type LoopRuntime = typeof LOOP_RUNTIME_CURSOR | typeof LOOP_RUNTIME_CLINE_PASS

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

export type ResolvedLoopAgent =
  | { runtime: typeof LOOP_RUNTIME_CURSOR; model: typeof CURSOR_LOOP_MODEL }
  | { runtime: typeof LOOP_RUNTIME_CLINE_PASS; model: ClinePassLoopModel }

export function defaultModelForRuntime(runtime: LoopRuntime): string {
  return runtime === LOOP_RUNTIME_CLINE_PASS ? DEFAULT_CLINE_PASS_LOOP_MODEL : CURSOR_LOOP_MODEL
}

export function isClinePassModel(model: string): model is ClinePassLoopModel {
  return (CLINE_PASS_LOOP_MODELS as readonly string[]).includes(model)
}

function assertClinePassModel(model: string, field: 'model' | 'escalateModel'): ClinePassLoopModel {
  if (!isClinePassModel(model)) {
    throw new Error(
      `Unknown ClinePass ${field} "${model}". Use a slug from CLINE_PASS_LOOP_MODELS`,
    )
  }
  return model
}

export function resolveLoopAgent(config: LoopConfig): ResolvedLoopAgent {
  const runtime = config.runtime ?? LOOP_RUNTIME_CURSOR
  const model = config.model ?? defaultModelForRuntime(runtime)

  if (runtime === LOOP_RUNTIME_CURSOR) {
    if (model !== CURSOR_LOOP_MODEL) {
      throw new Error(
        `loop.json model must be "${CURSOR_LOOP_MODEL}" for runtime "cursor" (got "${model}")`,
      )
    }
    return { runtime, model: CURSOR_LOOP_MODEL }
  }

  return { runtime, model: assertClinePassModel(model, 'model') }
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

  if (config.escalateModel !== CURSOR_LOOP_MODEL) {
    throw new Error(
      `escalateModel is only used with runtime "cline-pass" (got runtime "cursor" and escalateModel "${config.escalateModel}")`,
    )
  }
}

export function resolveIterationAgent(
  config: LoopConfig,
  escalationRepeatCount: number | undefined,
): ResolvedLoopAgent {
  const base = resolveLoopAgent(config)
  const threshold = config.escalateAfterStagnation ?? 2
  const escalateModel = config.escalateModel

  if (
    base.runtime === LOOP_RUNTIME_CLINE_PASS &&
    escalateModel &&
    escalationRepeatCount !== undefined &&
    escalationRepeatCount >= threshold
  ) {
    return { runtime: base.runtime, model: assertClinePassModel(escalateModel, 'escalateModel') }
  }

  return base
}

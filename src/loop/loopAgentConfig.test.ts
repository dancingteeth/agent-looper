import { describe, expect, it } from 'vitest'
import {
  CLINE_PASS_LOOP_MODELS,
  clearIncompatibleAgentFieldsOnRuntimeSwitch,
  clearIncompatibleReviewFieldsOnRuntimeSwitch,
  resolveIterationAgent,
  resolveLoopAgent,
  resolveReviewAgent,
  resolveReviewModel,
  resolveSecondaryReviewAgent,
  runtimeHonorsReasoningEffort,
  toPiThinkingLevel,
} from './loopAgentConfig.js'
import { loopConfigSchema } from './loopConfig.js'

function clinePassConfig(overrides: Record<string, unknown> = {}) {
  return loopConfigSchema.parse({
    verify: 'true',
    runtime: 'cline-pass',
    ...overrides,
  })
}

describe('runtimeHonorsReasoningEffort', () => {
  it('is true for Cline and Pi, false for the others', () => {
    expect(runtimeHonorsReasoningEffort('cline')).toBe(true)
    expect(runtimeHonorsReasoningEffort('cline-pass')).toBe(true)
    expect(runtimeHonorsReasoningEffort('pi')).toBe(true)
    expect(runtimeHonorsReasoningEffort('muse')).toBe(true)
    expect(runtimeHonorsReasoningEffort('cursor')).toBe(false)
    expect(runtimeHonorsReasoningEffort('opencode')).toBe(false)
    expect(runtimeHonorsReasoningEffort('codex')).toBe(false)
    expect(runtimeHonorsReasoningEffort('dsh')).toBe(false)
  })
})

describe('toPiThinkingLevel', () => {
  it('maps unset and none to off; set values pass through', () => {
    expect(toPiThinkingLevel(undefined)).toBe('off')
    expect(toPiThinkingLevel('none')).toBe('off')
    expect(toPiThinkingLevel('low')).toBe('low')
    expect(toPiThinkingLevel('xhigh')).toBe('xhigh')
  })
})

describe('CLINE_PASS_LOOP_MODELS', () => {
  it('includes current Pass lineup slugs (Kimi K3, GLM-5.3, Qwen3.8 Max)', () => {
    expect(CLINE_PASS_LOOP_MODELS).toContain('cline-pass/kimi-k3')
    expect(CLINE_PASS_LOOP_MODELS).toContain('cline-pass/glm-5.3')
    expect(CLINE_PASS_LOOP_MODELS).toContain('cline-pass/qwen3.8-max')
  })

  it('accepts kimi-k3 as a worker model', () => {
    const parsed = clinePassConfig({ model: 'cline-pass/kimi-k3' })
    expect(resolveLoopAgent(parsed).model).toBe('cline-pass/kimi-k3')
  })
})

describe('resolveIterationAgent reasoning effort', () => {
  it('carries base reasoningEffort at iteration 1', () => {
    const agent = resolveIterationAgent(
      clinePassConfig({ reasoningEffort: 'medium' }),
      1,
      undefined,
    )
    expect(agent.reasoningEffort).toBe('medium')
  })

  it('steps reasoning up one tier per iteration toward the ceiling', () => {
    const config = clinePassConfig({
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
      reasoningEscalationStep: 1,
    })
    expect(resolveIterationAgent(config, 1, undefined).reasoningEffort).toBe('medium')
    expect(resolveIterationAgent(config, 2, undefined).reasoningEffort).toBe('high')
    expect(resolveIterationAgent(config, 3, undefined).reasoningEffort).toBe('xhigh')
    // capped at the ceiling on later iterations
    expect(resolveIterationAgent(config, 6, undefined).reasoningEffort).toBe('xhigh')
  })

  it('steps up two tiers per iteration when reasoningEscalationStep is 2', () => {
    const config = clinePassConfig({
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
      reasoningEscalationStep: 2,
    })
    expect(resolveIterationAgent(config, 1, undefined).reasoningEffort).toBe('medium')
    expect(resolveIterationAgent(config, 2, undefined).reasoningEffort).toBe('xhigh')
  })

  it('switches model only after reasoning reaches the ceiling AND hard stagnation', () => {
    const config = clinePassConfig({
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
      escalateModel: 'cline-pass/qwen3.7-max',
      escalateAfterStagnation: 2,
      escalateModelReasoningEffort: 'high',
      reasoningEscalationStep: 1,
    })
    // iteration 1: medium, no model switch yet
    const itr1 = resolveIterationAgent(config, 1, undefined)
    expect(itr1.model).toBe('cline-pass/deepseek-v4-flash')
    expect(itr1.reasoningEffort).toBe('medium')
    // at ceiling but no stagnation signature yet → still on flash
    const itr3 = resolveIterationAgent(config, 3, undefined)
    expect(itr3.model).toBe('cline-pass/deepseek-v4-flash')
    expect(itr3.reasoningEffort).toBe('xhigh')
    // at ceiling + identical-failure stagnation → switch to qwen at its own tier
    const itr3Stuck = resolveIterationAgent(config, 3, 2)
    expect(itr3Stuck.model).toBe('cline-pass/qwen3.7-max')
    expect(itr3Stuck.reasoningEffort).toBe('high')
  })

  it('switches model on worker fault even before the reasoning ceiling', () => {
    const config = clinePassConfig({
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
      escalateModel: 'cline-pass/qwen3.7-max',
      escalateModelReasoningEffort: 'high',
    })
    const agent = resolveIterationAgent(config, 1, undefined, 0, true)
    expect(agent.model).toBe('cline-pass/qwen3.7-max')
    expect(agent.reasoningEffort).toBe('high')
  })

  it('switches model on stagnation even without a reasoning ladder', () => {
    const config = clinePassConfig({
      escalateModel: 'cline-pass/qwen3.7-max',
      escalateAfterStagnation: 2,
    })
    const agent = resolveIterationAgent(config, 1, 2)
    expect(agent.model).toBe('cline-pass/qwen3.7-max')
    expect(agent.reasoningEffort).toBeUndefined()
  })

  it('leaves reasoningEffort unset when not configured', () => {
    const agent = resolveLoopAgent(clinePassConfig({}))
    expect(agent.reasoningEffort).toBeUndefined()
  })

  it('does not attach reasoningEffort for cursor runtime', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cursor',
      reasoningEffort: 'high',
      escalateReasoningEffort: 'xhigh',
    })
    const agent = resolveIterationAgent(config, 5, undefined)
    expect(agent.reasoningEffort).toBeUndefined()
  })

  it('defaults reviewModel to grok-4.6 for cursor runtime', () => {
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    expect(resolveReviewModel(config)).toBe('grok-4.6')
  })

  it('defaults reviewModel to composer-2.5 for cline-pass runtime', () => {
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cline-pass' })
    expect(resolveReviewModel(config)).toBe('composer-2.5')
  })

  it('accepts explicit reviewModel override', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cursor',
      reviewModel: 'composer-2.5',
    })
    expect(resolveReviewModel(config)).toBe('composer-2.5')
  })

  it('rejects unknown reviewModel', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        runtime: 'cursor',
        reviewModel: 'gpt-5',
      }),
    ).toThrow(/reviewModel/)
  })

  it('resolveReviewAgent defaults cursor judge to grok-4.6 on cursor worker', () => {
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    expect(resolveReviewAgent(config)).toEqual({ runtime: 'cursor', model: 'grok-4.6' })
  })

  it('resolveReviewAgent defaults cursor judge to composer-2.5 on cline-pass worker', () => {
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cline-pass' })
    expect(resolveReviewAgent(config)).toEqual({ runtime: 'cursor', model: 'composer-2.5' })
  })

  it('resolveReviewAgent uses defaultModelForRuntime when reviewRuntime is pi', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'pi',
      reviewRuntime: 'pi',
    })
    expect(resolveReviewAgent(config)).toEqual({
      runtime: 'pi',
      model: 'openrouter/deepseek/deepseek-chat',
    })
  })

  it('resolveReviewAgent defaults OpenCode judge to DeepSeek V4 Pro when reviewRuntime is opencode', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      reviewRuntime: 'opencode',
    })
    expect(resolveReviewAgent(config)).toEqual({
      runtime: 'opencode',
      model: 'opencode-go/deepseek-v4-pro',
    })
  })

  it('resolveReviewAgent defaults DSH judge to V4 Pro when reviewRuntime is dsh', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'dsh',
      reviewRuntime: 'dsh',
    })
    expect(resolveReviewAgent(config)).toEqual({
      runtime: 'dsh',
      model: 'deepseek-official/deepseek-v4-pro',
    })
  })

  it('resolveLoopAgent defaults DSH worker to official Flash', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'dsh',
    })
    expect(resolveLoopAgent(config)).toEqual({
      runtime: 'dsh',
      model: 'deepseek-official/deepseek-v4-flash',
    })
  })

  it('accepts DSH flash-vision-exp as a worker model', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'dsh',
      model: 'deepseek-official/deepseek-v4-flash-vision-exp',
    })
    expect(resolveLoopAgent(config).model).toBe(
      'deepseek-official/deepseek-v4-flash-vision-exp',
    )
  })

  it('escalates DSH model on stagnation', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'dsh',
      escalateModel: 'deepseek-official/deepseek-v4-pro',
      escalateAfterStagnation: 2,
    })
    expect(resolveIterationAgent(config, 3, 2).model).toBe('deepseek-official/deepseek-v4-pro')
    expect(resolveIterationAgent(config, 3, 1).model).toBe('deepseek-official/deepseek-v4-flash')
  })

  it('resolveReviewAgent defaults Codex judge to Sol when reviewRuntime is codex', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'codex',
      reviewRuntime: 'codex',
    })
    expect(resolveReviewAgent(config)).toEqual({
      runtime: 'codex',
      model: 'gpt-5.6-sol',
    })
  })

  it('resolveReviewAgent defaults Muse judge to Spark 1.2 when reviewRuntime is muse', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'muse',
      reviewRuntime: 'muse',
    })
    expect(resolveLoopAgent(config)).toEqual({
      runtime: 'muse',
      model: 'muse-spark-1.2-contributor',
    })
    expect(resolveReviewAgent(config)).toEqual({
      runtime: 'muse',
      model: 'muse-spark-1.2',
    })
    expect(config.escalateModel).toBeUndefined()
  })

  it('climbs Muse reasoning effort without switching Spark slugs', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'muse',
      reasoningEffort: 'low',
      escalateReasoningEffort: 'high',
    })
    expect(resolveIterationAgent(config, 1, undefined)).toMatchObject({
      runtime: 'muse',
      model: 'muse-spark-1.2-contributor',
      reasoningEffort: 'low',
    })
    expect(resolveIterationAgent(config, 3, 2)).toMatchObject({
      runtime: 'muse',
      model: 'muse-spark-1.2-contributor',
      reasoningEffort: 'high',
    })
  })

  it('escalates Codex model on stagnation', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'codex',
      escalateModel: 'gpt-5.6-terra',
      escalateAfterStagnation: 2,
    })
    expect(resolveIterationAgent(config, 1, undefined).model).toBe('gpt-5.6-luna')
    expect(resolveIterationAgent(config, 3, 2).model).toBe('gpt-5.6-terra')
  })

  it('rejects reviewModel incompatible with reviewRuntime', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        runtime: 'pi',
        reviewRuntime: 'pi',
        reviewModel: 'grok-4.5',
      }),
    ).toThrow(/reviewModel/)
  })

  it('escalates model on stagnation for cline credits runtime', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cline',
      model: 'deepseek/deepseek-chat',
      escalateModel: 'qwen/qwen3-coder-plus',
      escalateAfterStagnation: 2,
    })
    const agent = resolveIterationAgent(config, 1, 2)
    expect(agent.runtime).toBe('cline')
    expect(agent.model).toBe('qwen/qwen3-coder-plus')
  })

  it('escalates reasoning one tier per BLOCKERS fix round', () => {
    const config = clinePassConfig({
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
      reasoningEscalationStep: 1,
    })
    // iteration 1 baseline, then each review-blocker fix round steps up a tier
    expect(resolveIterationAgent(config, 1, undefined, 0).reasoningEffort).toBe('medium')
    expect(resolveIterationAgent(config, 1, undefined, 1).reasoningEffort).toBe('high')
    expect(resolveIterationAgent(config, 1, undefined, 2).reasoningEffort).toBe('xhigh')
    // capped at the ceiling even with many fix rounds
    expect(resolveIterationAgent(config, 1, undefined, 5).reasoningEffort).toBe('xhigh')
  })

  it('adds review-cycle escalation on top of the iteration baseline climb (ceiling-capped)', () => {
    const config = clinePassConfig({
      reasoningEffort: 'low',
      escalateReasoningEffort: 'xhigh',
      reasoningEscalationStep: 1,
    })
    // iteration 1 baseline
    expect(resolveIterationAgent(config, 1, undefined, 0).reasoningEffort).toBe('low')
    // review-cycle escalation stacks on the iteration climb...
    expect(resolveIterationAgent(config, 1, undefined, 2).reasoningEffort).toBe('high')
    // ...and is capped at the ceiling
    expect(resolveIterationAgent(config, 3, undefined, 0).reasoningEffort).toBe('high')
    expect(resolveIterationAgent(config, 3, undefined, 2).reasoningEffort).toBe('xhigh')
  })
})

describe('clearIncompatibleAgentFieldsOnRuntimeSwitch', () => {
  it('clears Pass slugs when moving to credits without overrides', () => {
    const result = clearIncompatibleAgentFieldsOnRuntimeSwitch({
      previousRuntime: 'cline-pass',
      nextRuntime: 'cline',
      model: 'cline-pass/deepseek-v4-flash',
      escalateModel: 'cline-pass/qwen3.7-plus',
      modelOverridden: false,
      escalateModelOverridden: false,
    })
    expect(result.model).toBeUndefined()
    expect(result.escalateModel).toBeUndefined()
    expect(result.warnings).toHaveLength(2)
  })

  it('preserves explicit model override even when incompatible (caller validates)', () => {
    const result = clearIncompatibleAgentFieldsOnRuntimeSwitch({
      previousRuntime: 'cline-pass',
      nextRuntime: 'cline',
      model: 'cline-pass/deepseek-v4-flash',
      modelOverridden: true,
      escalateModelOverridden: false,
    })
    expect(result.model).toBe('cline-pass/deepseek-v4-flash')
    expect(result.warnings).toHaveLength(0)
  })
})

describe('clearIncompatibleReviewFieldsOnRuntimeSwitch', () => {
  it('clears cursor reviewModel when switching reviewRuntime to pi', () => {
    const result = clearIncompatibleReviewFieldsOnRuntimeSwitch({
      previousReviewRuntime: 'cursor',
      nextReviewRuntime: 'pi',
      reviewModel: 'grok-4.5',
      reviewModelOverridden: false,
    })
    expect(result.reviewModel).toBeUndefined()
    expect(result.warnings).toHaveLength(1)
  })

  it('keeps compatible reviewModel across reviewRuntime switch', () => {
    const result = clearIncompatibleReviewFieldsOnRuntimeSwitch({
      previousReviewRuntime: 'opencode',
      nextReviewRuntime: 'pi',
      reviewModel: 'openrouter/deepseek/deepseek-chat',
      reviewModelOverridden: false,
    })
    expect(result.reviewModel).toBe('openrouter/deepseek/deepseek-chat')
    expect(result.warnings).toHaveLength(0)
  })

  it('preserves explicit reviewModel override even when incompatible', () => {
    const result = clearIncompatibleReviewFieldsOnRuntimeSwitch({
      previousReviewRuntime: 'cursor',
      nextReviewRuntime: 'pi',
      reviewModel: 'grok-4.5',
      reviewModelOverridden: true,
    })
    expect(result.reviewModel).toBe('grok-4.5')
    expect(result.warnings).toHaveLength(0)
  })
})

describe('resolveIterationAgent pi', () => {
  it('climbs the reasoning ladder like Cline', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'pi',
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
    })
    expect(resolveIterationAgent(config, 1, undefined).reasoningEffort).toBe('medium')
    expect(resolveIterationAgent(config, 2, undefined).reasoningEffort).toBe('high')
    expect(resolveIterationAgent(config, 3, undefined).reasoningEffort).toBe('xhigh')
  })
})

describe('resolveIterationAgent opencode', () => {
  it('does not attach reasoningEffort (OpenCode SDK path ignores it)', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      reasoningEffort: 'high',
    })
    const agent = resolveIterationAgent(config, 3, undefined)
    expect(agent.runtime).toBe('opencode')
    expect(agent).not.toHaveProperty('reasoningEffort')
  })

  it('escalates model on stagnation without a reasoning ladder', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      escalateModel: 'opencode-go/qwen3.7-plus',
    })
    const agent = resolveIterationAgent(config, 1, 2)
    expect(agent).toEqual({
      runtime: 'opencode',
      model: 'opencode-go/qwen3.7-plus',
    })
  })

  it('switches model on worker fault without waiting for verifier stagnation', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'opencode',
      model: 'opencode-go/deepseek-v4-flash',
      escalateModel: 'opencode-go/qwen3.7-plus',
    })
    expect(resolveIterationAgent(config, 2, undefined, 0, false).model).toBe(
      'opencode-go/deepseek-v4-flash',
    )
    expect(resolveIterationAgent(config, 2, undefined, 0, true).model).toBe(
      'opencode-go/qwen3.7-plus',
    )
  })
})

describe('resolveSecondaryReviewAgent', () => {
  it('returns undefined when reviewSecondaryRuntime is unset', () => {
    expect(resolveSecondaryReviewAgent({})).toBeUndefined()
  })

  it('defaults model per cline-pass runtime', () => {
    expect(
      resolveSecondaryReviewAgent({ reviewSecondaryRuntime: 'cline-pass' }),
    ).toEqual({
      runtime: 'cline-pass',
      model: 'cline-pass/deepseek-v4-flash',
    })
  })

  it('defaults model per cline credits runtime', () => {
    expect(resolveSecondaryReviewAgent({ reviewSecondaryRuntime: 'cline' })).toEqual({
      runtime: 'cline',
      model: 'deepseek/deepseek-chat',
    })
  })

  it('honors an explicit secondary model', () => {
    expect(
      resolveSecondaryReviewAgent({
        reviewSecondaryRuntime: 'dsh',
        reviewSecondaryModel: 'deepseek-official/deepseek-v4-flash',
      }),
    ).toEqual({
      runtime: 'dsh',
      model: 'deepseek-official/deepseek-v4-flash',
    })
  })

  it('accepts cursor and dsh secondary judges with review defaults', () => {
    expect(resolveSecondaryReviewAgent({ reviewSecondaryRuntime: 'cursor' })).toEqual({
      runtime: 'cursor',
      model: 'grok-4.6',
    })
    expect(resolveSecondaryReviewAgent({ reviewSecondaryRuntime: 'dsh' })).toEqual({
      runtime: 'dsh',
      model: 'deepseek-official/deepseek-v4-pro',
    })
  })

  it('defaults Cursor secondary to composer-2.5 when the worker is not cursor', () => {
    expect(
      resolveSecondaryReviewAgent({
        runtime: 'dsh',
        reviewSecondaryRuntime: 'cursor',
      }),
    ).toEqual({ runtime: 'cursor', model: 'composer-2.5' })
  })

  it('names reviewSecondaryModel in validation errors', () => {
    expect(() =>
      resolveSecondaryReviewAgent({
        reviewSecondaryRuntime: 'cline',
        reviewSecondaryModel: 'cline-pass/deepseek-v4-flash',
      }),
    ).toThrow(/reviewSecondaryModel/)
  })
})

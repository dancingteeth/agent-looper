import { describe, expect, it } from 'vitest'
import {
  clearIncompatibleAgentFieldsOnRuntimeSwitch,
  resolveIterationAgent,
  resolveLoopAgent,
} from './loopAgentConfig.js'
import { loopConfigSchema } from './loopConfig.js'

function clinePassConfig(overrides: Record<string, unknown> = {}) {
  return loopConfigSchema.parse({
    verify: 'true',
    runtime: 'cline-pass',
    ...overrides,
  })
}

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

  it('does not escalate reasoning for cursor runtime', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cursor',
      reasoningEffort: 'high',
      escalateReasoningEffort: 'xhigh',
    })
    const agent = resolveIterationAgent(config, 5, undefined)
    expect(agent.reasoningEffort).toBe('high')
  })

  it('escalates model on stagnation for cline credits runtime', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cline',
      model: 'deepseek/deepseek-chat',
      escalateModel: 'google/gemini-2.5-pro',
      escalateAfterStagnation: 2,
    })
    const agent = resolveIterationAgent(config, 1, 2)
    expect(agent.runtime).toBe('cline')
    expect(agent.model).toBe('google/gemini-2.5-pro')
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

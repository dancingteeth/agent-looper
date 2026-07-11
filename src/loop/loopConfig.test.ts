import { describe, expect, it } from 'vitest'
import { resolveLoopAgent } from './loopAgentConfig.js'
import { loopConfigSchema, mergeLoopConfig, parseLoopConfig } from './loopConfig.js'

describe('loopConfigSchema', () => {
  it('applies defaults', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.maxIterations).toBe(8)
    expect(parsed.delayMs).toBe(1500)
    expect(parsed.verifyLogMode).toBe('inline')
  })

  it('defaults syncOnSuccess to true', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.syncOnSuccess).toBe(true)
  })

  it('accepts legacy syncPostgres alias', () => {
    const parsed = parseLoopConfig({ verify: 'true', syncPostgres: false })
    expect(parsed.syncOnSuccess).toBe(false)
  })

  it('accepts taskwarriorProject override', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      taskwarriorProject: 'zwook',
    })
    expect(parsed.taskwarriorProject).toBe('zwook')
  })

  it('accepts cline-pass runtime with default model', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cline-pass',
    })
    expect(parsed.runtime).toBe('cline-pass')
    expect(resolveLoopAgent(parsed).model).toBe('cline-pass/deepseek-v4-flash')
  })

  it('accepts optional hitlCheck', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      hitlCheck: 'affiliate hub ref capture',
    })
    expect(parsed.hitlCheck).toBe('affiliate hub ref capture')
  })

  it('rejects empty hitlCheck', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        hitlCheck: '   ',
      }),
    ).toThrow()
  })

  it('defaults stagnationThreshold to 3', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.stagnationThreshold).toBe(3)
  })

  it('accepts reasoningEffort and escalateReasoningEffort for cline-pass', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cline-pass',
      reasoningEffort: 'high',
      escalateReasoningEffort: 'xhigh',
    })
    expect(parsed.reasoningEffort).toBe('high')
    expect(parsed.escalateReasoningEffort).toBe('xhigh')
  })

  it('rejects unknown reasoningEffort value', () => {
    expect(() =>
      loopConfigSchema.parse({ verify: 'true', reasoningEffort: 'ultra' }),
    ).toThrow()
  })

  it('defaults reviewGate to false and maxReviewCycles to 2', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.reviewGate).toBe(false)
    expect(parsed.maxReviewCycles).toBe(2)
  })

  it('defaults mode to forward and pauseAfterIteration to false', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.mode).toBe('forward')
    expect(parsed.pauseAfterIteration).toBe(false)
    expect(parsed.injectFailureContext).toBe(false)
  })

  it('accepts reverse mode and injectFailureContext', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      mode: 'reverse',
      injectFailureContext: true,
      pauseAfterIteration: true,
    })
    expect(parsed.mode).toBe('reverse')
    expect(parsed.injectFailureContext).toBe(true)
    expect(parsed.pauseAfterIteration).toBe(true)
  })

  it('accepts reviewGate and maxReviewCycles overrides', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      reviewGate: true,
      maxReviewCycles: 3,
    })
    expect(parsed.reviewGate).toBe(true)
    expect(parsed.maxReviewCycles).toBe(3)
  })

  it('defaults reviewGateHitl to false and accepts it', () => {
    expect(loopConfigSchema.parse({ verify: 'true' }).reviewGateHitl).toBe(false)
    expect(
      loopConfigSchema.parse({ verify: 'true', reviewGateHitl: true }).reviewGateHitl,
    ).toBe(true)
  })

  it('defaults unparseableReviewRetries to 2 and reviewBlockerRecheck to true', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.unparseableReviewRetries).toBe(2)
    expect(parsed.reviewBlockerRecheck).toBe(true)
  })

  it('rejects unparseableReviewRetries outside 1..5', () => {
    expect(() => loopConfigSchema.parse({ verify: 'true', unparseableReviewRetries: 0 })).toThrow()
    expect(() => loopConfigSchema.parse({ verify: 'true', unparseableReviewRetries: 6 })).toThrow()
  })

  it('rejects maxReviewCycles outside 1..5', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        maxReviewCycles: 0,
      }),
    ).toThrow()
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        maxReviewCycles: 6,
      }),
    ).toThrow()
  })

  it('rejects numeric taskwarriorUuid', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        taskwarriorUuid: '217',
      }),
    ).toThrow()
  })

  it('rejects taskwarriorProject with spaces', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        taskwarriorProject: 'my project',
      }),
    ).toThrow(/spaces/i)
  })

  it('rejects Composer Fast models for cursor runtime', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        runtime: 'cursor',
        model: 'composer-2.5-fast',
      }),
    ).toThrow(/banned/i)
  })
})

describe('mergeLoopConfig', () => {
  it('overrides verify from CLI', () => {
    const base = loopConfigSchema.parse({ verify: 'echo a', maxIterations: 3 })
    const merged = mergeLoopConfig(base, { verify: 'echo b' })
    expect(merged.verify).toBe('echo b')
    expect(merged.maxIterations).toBe(3)
  })
})

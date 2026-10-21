import { describe, expect, it } from 'vitest'
import { resolveStagnationPolicy } from './loopStagnationPolicy.js'
import { loopConfigSchema } from './loopConfig.js'

describe('resolveStagnationPolicy', () => {
  const config = loopConfigSchema.parse({ verify: 'true', escalateAfterStagnation: 1 })

  it('escalates on first repeat when escalateAfterStagnation is 1', () => {
    const policy = resolveStagnationPolicy(config, 1)
    expect(policy.escalationRepeatCount).toBe(1)
    expect(policy.promptRepeatCount).toBeUndefined()
    expect(policy.probeRepeatCount).toBeUndefined()
  })

  it('injects prompt hint from second repeat', () => {
    const policy = resolveStagnationPolicy(config, 2)
    expect(policy.promptRepeatCount).toBe(2)
  })

  it('stallProbes defaults off — escalation unchanged', () => {
    const withProbes = loopConfigSchema.parse({
      verify: 'true',
      escalateAfterStagnation: 2,
      stallProbes: true,
    })
    expect(resolveStagnationPolicy(withProbes, 1).probeRepeatCount).toBeUndefined()
    const probeRound = resolveStagnationPolicy(withProbes, 2)
    expect(probeRound.probeRepeatCount).toBe(2)
    expect(probeRound.escalationRepeatCount).toBeUndefined()
    const after = resolveStagnationPolicy(withProbes, 3, true)
    expect(after.probeRepeatCount).toBeUndefined()
    expect(after.escalationRepeatCount).toBe(3)
  })

  it('stagnationThreshold 0 disables probes', () => {
    const configZero = loopConfigSchema.parse({
      verify: 'true',
      stagnationThreshold: 0,
      stallProbes: true,
    })
    expect(resolveStagnationPolicy(configZero, 4).probeRepeatCount).toBeUndefined()
  })
})

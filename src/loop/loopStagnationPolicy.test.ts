import { describe, expect, it } from 'vitest'
import { resolveStagnationPolicy } from './loopStagnationPolicy.js'
import { loopConfigSchema } from './loopConfig.js'

describe('resolveStagnationPolicy', () => {
  const config = loopConfigSchema.parse({ verify: 'true', escalateAfterStagnation: 1 })

  it('escalates on first repeat when escalateAfterStagnation is 1', () => {
    const policy = resolveStagnationPolicy(config, 1)
    expect(policy.escalationRepeatCount).toBe(1)
    expect(policy.promptRepeatCount).toBeUndefined()
  })

  it('injects prompt hint from second repeat', () => {
    const policy = resolveStagnationPolicy(config, 2)
    expect(policy.promptRepeatCount).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import { deriveLoopRunStatus } from './agentLoop.js'

describe('deriveLoopRunStatus', () => {
  it('maps complete to done', () => {
    expect(deriveLoopRunStatus({ complete: true })).toBe('done')
  })

  it('maps HITL escalate to waiting', () => {
    expect(
      deriveLoopRunStatus({ complete: false, reviewEscalatedToHitl: true }),
    ).toBe('waiting')
  })

  it('maps other incomplete to continue', () => {
    expect(deriveLoopRunStatus({ complete: false })).toBe('continue')
  })
})

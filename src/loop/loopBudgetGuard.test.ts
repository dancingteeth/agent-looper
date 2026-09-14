import { describe, expect, it } from 'vitest'
import { unpricedModelWarnings } from './loopBudgetGuard.js'

describe('unpricedModelWarnings', () => {
  it('dedupes, skips undefined, and ignores priced models', () => {
    const lines = unpricedModelWarnings([
      'composer-2.5',
      undefined,
      'composer-2.5',
      'opencode-go/brand-new-model',
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/opencode-go\/brand-new-model/)
    expect(lines[0]).toMatch(/priced catalog/)
  })
})

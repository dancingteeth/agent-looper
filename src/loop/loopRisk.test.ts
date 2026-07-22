import { describe, it, expect } from 'vitest'
import { inferLoopReviewRisk, resolvePostQualityReview, resolveShouldRunQualityReview } from './loopRisk.js'

describe('loopRisk', () => {
  it('classifies checkout/affiliate loops as medium or high', () => {
    const goal = 'On order checkout completion, attribute sale to affiliate ref and track conversion.'
    const verify = 'pnpm exec vitest run src/lib/affiliate'
    expect(['high', 'medium']).toContain(inferLoopReviewRisk(goal, verify))
    expect(resolvePostQualityReview('auto', goal, verify)).toBe(true)
  })

  it('classifies harness-only loops as low under auto', () => {
    const goal = 'Fix failing tests under @dancingteeth/agent-loop related to the agent loop harness.'
    const verify = 'pnpm exec vitest run src/loop/'
    expect(inferLoopReviewRisk(goal, verify)).toBe('low')
    expect(resolvePostQualityReview('auto', goal, verify)).toBe(false)
  })

  it('respects explicit boolean overrides', () => {
    const goal = 'docs only'
    const verify = 'pnpm exec vitest run src/loop/'
    expect(resolvePostQualityReview(false, goal, verify)).toBe(false)
    expect(resolvePostQualityReview(true, goal, verify)).toBe(true)
  })

  it('runs review when reviewGate is on regardless of risk', () => {
    const goal = 'docs only'
    const verify = 'pnpm exec vitest run src/loop/'
    expect(
      resolveShouldRunQualityReview(
        { postQualityReview: 'auto', reviewGate: true, reviewRisk: 'auto' },
        goal,
        verify,
      ),
    ).toBe(true)
  })

  it('respects explicit reviewRisk override on auto postQualityReview', () => {
    const goal = 'docs only'
    const verify = 'pnpm exec vitest run src/loop/'
    expect(
      resolvePostQualityReview('auto', goal, verify, { reviewRisk: 'high' }),
    ).toBe(true)
    expect(
      resolvePostQualityReview('auto', goal, verify, { reviewRisk: 'low' }),
    ).toBe(false)
  })
})

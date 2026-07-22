import { describe, it, expect } from 'vitest'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  DEFAULT_LOOP_RISK_KEYWORDS,
  inferLoopReviewRiskWithProfile,
  parseLoopRiskKeywordsFromReviewsMd,
  resolveLoopRiskKeywords,
} from './loopRiskProfile.js'

describe('loopRiskProfile', () => {
  it('parses HIGH/MEDIUM/LOW keyword lists from REVIEWS.md section', () => {
    const parsed = parseLoopRiskKeywordsFromReviewsMd(`# Reviews

## Loop risk inference

### HIGH
auth, payment, network egress

### MEDIUM
checkout, affiliate

### LOW
docs, harness
`)
    expect(parsed?.high).toEqual(['auth', 'payment', 'network egress'])
    expect(parsed?.medium).toEqual(['checkout', 'affiliate'])
    expect(parsed?.low).toEqual(['docs', 'harness'])
  })

  it('merges repo REVIEWS.md keywords with harness defaults', () => {
    const ctx = resolveRepoContext()
    const keywords = resolveLoopRiskKeywords({ ctx })
    expect(keywords.high).toContain('auth')
    expect(keywords.high).toContain('network egress')
    expect(keywords.low).toContain('agent loop')
  })

  it('applies per-loop keyword overrides on top of resolved profile', () => {
    const ctx = resolveRepoContext()
    const keywords = resolveLoopRiskKeywords({
      ctx,
      loopOverride: { high: ['maxin-dxp', 'telegram-bot-admin'] },
    })
    expect(keywords.high).toContain('maxin-dxp')
    expect(keywords.high).toContain('auth')
  })

  it('honors explicit reviewRisk override without keyword inference', () => {
    const risk = inferLoopReviewRiskWithProfile('docs only', 'pnpm exec vitest run src/loop/', {
      profile: DEFAULT_LOOP_RISK_KEYWORDS,
      reviewRisk: 'high',
    })
    expect(risk).toBe('high')
  })

  it('classifies consumer-specific high keywords from merged profile', () => {
    const profile = resolveLoopRiskKeywords({
      ctx: resolveRepoContext(),
      loopOverride: { high: ['maxin-dxp'] },
    })
    const risk = inferLoopReviewRiskWithProfile(
      'Wire Maxin DXP checkout webhook',
      'pnpm exec vitest run src/lib/checkout',
      { profile },
    )
    expect(risk).toBe('high')
  })
})

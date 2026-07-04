import { describe, it, expect } from 'vitest'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  buildQualityReviewPrompt,
  buildRiskTriagePreamble,
  buildThermoNuclearReviewPrompt,
} from './reviewPrompt.js'

describe('reviewPrompt', () => {
  it('puts risk triage before repository review standards in shared prompt', () => {
    const ctx = resolveRepoContext()
    const prompt = buildQualityReviewPrompt({
      ctx,
      context: 'Test context',
      diffStat: '1 file changed',
    })

    const riskIdx = prompt.indexOf('blast radius')
    const standardsIdx = prompt.indexOf('Repository review standards')
    expect(riskIdx).toBeGreaterThan(-1)
    expect(standardsIdx).toBeGreaterThan(riskIdx)
    expect(prompt).toContain('Test context')
  })

  it('includes Rahul GS framing in preamble', () => {
    const preamble = buildRiskTriagePreamble()
    expect(preamble).toContain('HIGH')
    expect(preamble).toContain('feature flag')
    expect(preamble).toContain('line-by-line')
  })

  it('builds thermo-nuclear prompt with diff stat', () => {
    const ctx = resolveRepoContext()
    const prompt = buildThermoNuclearReviewPrompt(ctx, '2 files changed')
    expect(prompt).toContain('thermo-nuclear code quality audit')
    expect(prompt).toContain('2 files changed')
    expect(prompt).toContain('blast radius')
  })
})

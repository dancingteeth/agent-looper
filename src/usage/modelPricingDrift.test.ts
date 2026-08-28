import { describe, expect, it } from 'vitest'
import { CLINE_PASS_LOOP_MODELS, OPENCODE_GO_LOOP_MODELS } from '../loop/loopAgentConfig.js'
import { MODEL_PRICING_PER_MILLION } from './loopUsage.js'
import {
  checkModelPricingDrift,
  collectModelPricingDriftIssues,
  formatModelPricingDriftReport,
  requiredLoopPricingModels,
} from './modelPricingDrift.js'

describe('modelPricingDrift', () => {
  it('has no drift between harness models and MODEL_PRICING_PER_MILLION', () => {
    const { ok, issues } = checkModelPricingDrift()
    expect(issues).toEqual([])
    expect(ok).toBe(true)
  })

  it('requires pricing for every CLINE_PASS_LOOP_MODELS slug', () => {
    for (const model of CLINE_PASS_LOOP_MODELS) {
      expect(MODEL_PRICING_PER_MILLION[model], `missing pricing for ${model}`).toBeDefined()
    }
  })

  it('requires pricing for every OPENCODE_GO_LOOP_MODELS slug', () => {
    for (const model of OPENCODE_GO_LOOP_MODELS) {
      expect(MODEL_PRICING_PER_MILLION[model], `missing pricing for ${model}`).toBeDefined()
    }
  })

  it('flags missing and stale pricing entries', () => {
    const required = requiredLoopPricingModels()
    expect(required.length).toBeGreaterThan(CLINE_PASS_LOOP_MODELS.length)

    const issues = collectModelPricingDriftIssues()
    expect(issues.some((i) => i.kind === 'missing-pricing')).toBe(false)
    expect(issues.some((i) => i.kind === 'stale-pricing')).toBe(false)
  })

  it('formats OK and drift reports for doctor output', () => {
    expect(formatModelPricingDriftReport([])).toContain('model pricing: OK')
    const report = formatModelPricingDriftReport([
      { kind: 'missing-pricing', model: 'vendor/new-model' },
      { kind: 'stale-pricing', model: 'vendor/retired-model' },
    ])
    expect(report).toContain('missing MODEL_PRICING_PER_MILLION entry for vendor/new-model')
    expect(report).toContain('stale MODEL_PRICING_PER_MILLION entry')
    expect(report).toContain('loopUsage.ts')
  })
})

import { describe, expect, it } from 'vitest'
import {
  createUsageRecord,
  estimateCostUsd,
  formatUsageSummaryLine,
  mergeUsageSummaries,
  summarizeUsageRecords,
} from './loopUsage.js'

describe('loopUsage', () => {
  it('estimates DeepSeek v4 Flash cost from official rates', () => {
    const cost = estimateCostUsd('cline-pass/deepseek-v4-flash', 1_000_000, 500_000)
    expect(cost).toBeCloseTo(0.14 + 0.14, 5)
  })

  it('estimates Composer 2.5 cost from official rates', () => {
    const cost = estimateCostUsd('composer-2.5', 200_000, 50_000)
    expect(cost).toBeCloseTo(0.1 + 0.125, 5)
  })

  it('prefers provider cost when present', () => {
    const record = createUsageRecord({
      phase: 'implement',
      runtime: 'cline-pass',
      model: 'cline-pass/deepseek-v4-flash',
      inputTokens: 1000,
      outputTokens: 500,
      providerCostUsd: 0.0099,
    })
    expect(record.costUsd).toBe(0.0099)
    expect(record.costSource).toBe('provider')
  })

  it('formats summary line with implement/review split', () => {
    const summary = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        inputTokens: 120_000,
        outputTokens: 8_000,
      }),
      createUsageRecord({
        phase: 'review',
        runtime: 'cursor',
        model: 'composer-2.5',
        inputTokens: 40_000,
        outputTokens: 2_000,
      }),
    ])
    const line = formatUsageSummaryLine(summary)
    expect(line).toContain('160.0k in')
    expect(line).toContain('implement')
    expect(line).toContain('review')
  })

  it('merges batch summaries', () => {
    const a = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        inputTokens: 10_000,
        outputTokens: 1_000,
      }),
    ])
    const b = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        inputTokens: 5_000,
        outputTokens: 500,
      }),
    ])
    const merged = mergeUsageSummaries(a, b)
    expect(merged.totalInputTokens).toBe(15_000)
    expect(merged.records).toHaveLength(2)
  })
})

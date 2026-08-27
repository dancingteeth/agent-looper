import { describe, expect, it } from 'vitest'
import {
  costSourceMix,
  createUsageRecord,
  estimateCostUsd,
  formatUsageSummaryLine,
  lastPhaseCostUsd,
  mergeUsageSummaries,
  nextCallFitsBudget,
  summarizeUsageRecords,
} from './loopUsage.js'

describe('loopUsage', () => {
  it('estimates DeepSeek v4 Flash cost from official rates', () => {
    const cost = estimateCostUsd('cline-pass/deepseek-v4-flash', 1_000_000, 500_000)
    expect(cost).toBeCloseTo(0.14 + 0.14, 5)
  })

  it('estimates OpenCode Go Hy3 cost from Go list rates', () => {
    const cost = estimateCostUsd('opencode-go/hy3', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.14 + 0.58, 5)
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

  it('surfaces cache read/write tokens only when present', () => {
    const noCache = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cursor',
        model: 'composer-2.5',
        inputTokens: 40_000,
        outputTokens: 2_000,
      }),
    ])
    expect(formatUsageSummaryLine(noCache)).not.toContain('cache R')

    const withCache = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        inputTokens: 120_000,
        outputTokens: 8_000,
        cacheReadTokens: 90_000,
        cacheWriteTokens: 30_000,
      }),
    ])
    const cachedLine = formatUsageSummaryLine(withCache)
    expect(cachedLine).toContain('cache R')
    expect(cachedLine).toContain('90.0k')
    expect(cachedLine).toContain('W 30.0k')
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

  it('labels the cost source mix', () => {
    const estimated = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'opencode',
        model: 'opencode-go/deepseek-v4-flash',
        inputTokens: 1000,
        outputTokens: 500,
      }),
    ])
    expect(costSourceMix(estimated)).toBe('estimated')

    const provider = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        inputTokens: 1000,
        outputTokens: 500,
        providerCostUsd: 0.01,
      }),
    ])
    expect(costSourceMix(provider)).toBe('provider')

    const mixed = mergeUsageSummaries(estimated, provider)
    expect(costSourceMix(mixed)).toBe('mixed')
  })

  it('refuses a billed call when predicted cost exceeds remaining cap', () => {
    const tooSmall = nextCallFitsBudget({
      maxCostUsd: 0.0001,
      spentUsd: 0,
      model: 'composer-2.5',
      promptChars: 40_000,
    })
    expect(tooSmall.ok).toBe(false)
    if (!tooSmall.ok) {
      expect(tooSmall.predictedUsd).toBeGreaterThan(0.0001)
      expect(tooSmall.remainingUsd).toBeCloseTo(0.0001)
    }

    const plenty = nextCallFitsBudget({
      maxCostUsd: 10,
      spentUsd: 0,
      model: 'composer-2.5',
      promptChars: 40_000,
    })
    expect(plenty.ok).toBe(true)

    const alreadySpent = nextCallFitsBudget({
      maxCostUsd: 5,
      spentUsd: 5,
      model: 'composer-2.5',
      promptChars: 10,
    })
    expect(alreadySpent.ok).toBe(false)

    const lastSession = nextCallFitsBudget({
      maxCostUsd: 1,
      spentUsd: 0.6,
      model: 'composer-2.5',
      promptChars: 10,
      lastSessionCostUsd: 0.5,
    })
    expect(lastSession.ok).toBe(false)
  })

  it('reads the latest cost for a usage phase', () => {
    const summary = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'cursor',
        model: 'composer-2.5',
        inputTokens: 1000,
        outputTokens: 100,
        providerCostUsd: 0.1,
      }),
      createUsageRecord({
        phase: 'implement',
        runtime: 'cursor',
        model: 'composer-2.5',
        inputTokens: 1000,
        outputTokens: 100,
        providerCostUsd: 0.24,
      }),
    ])
    expect(lastPhaseCostUsd(summary, 'implement')).toBe(0.24)
    expect(lastPhaseCostUsd(summary, 'review')).toBeUndefined()
  })
})

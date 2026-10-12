import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  costSourceMix,
  createUsageRecord,
  estimateCostUsd,
  formatUsageSummaryLine,
  isHostedFreeModel,
  lastPhaseCostUsd,
  mergeUsageSummaries,
  nextCallFitsBudget,
  resolvePricingModel,
  summarizeUsageRecords,
} from './loopUsage.js'

describe('loopUsage', () => {
  it('estimates DeepSeek v4 Flash cost from official rates', () => {
    const cost = estimateCostUsd('cline-pass/deepseek-v4-flash', 1_000_000, 500_000)
    expect(cost).toBeCloseTo(0.14 + 0.14, 5)
  })

  it('estimates DSH 4.1 Flash cost from official rates', () => {
    const cost = estimateCostUsd('deepseek-official/deepseek-flash', 1_000_000, 500_000)
    expect(cost).toBeCloseTo(0.15 + 0.3, 5)
  })

  it('estimates OpenCode Go Hy3 cost from Go list rates', () => {
    const cost = estimateCostUsd('opencode-go/hy3', 1_000_000, 1_000_000)
    expect(cost).toBeCloseTo(0.14 + 0.58, 5)
  })

  it('estimates Composer 2.5 cost from official rates', () => {
    const cost = estimateCostUsd('composer-2.5', 200_000, 50_000)
    expect(cost).toBeCloseTo(0.1 + 0.125, 5)
  })

  it('uses a positive provider invoice as the budget figure and keeps list', () => {
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
    expect(record.billedCostUsd).toBe(0.0099)
    expect(record.listCostUsd).toBeCloseTo(estimateCostUsd('cline-pass/deepseek-v4-flash', 1000, 500)!, 8)
  })

  it('treats subscription $0 as billed, not free, and budgets on list', () => {
    const record = createUsageRecord({
      phase: 'implement',
      runtime: 'opencode',
      model: 'opencode-go/hy3',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      providerCostUsd: 0,
    })
    expect(record.billedCostUsd).toBe(0)
    expect(record.listCostUsd).toBeCloseTo(0.72, 5)
    expect(record.costUsd).toBeCloseTo(0.72, 5)
    expect(record.costSource).toBe('estimated')
  })

  it('keeps hosted-free models at $0 list and billed', () => {
    expect(isHostedFreeModel('openrouter/minimax/minimax-m3:free')).toBe(true)
    const record = createUsageRecord({
      phase: 'implement',
      runtime: 'opencode',
      model: 'openrouter/minimax/minimax-m3:free',
      inputTokens: 50_000,
      outputTokens: 200,
      providerCostUsd: 0,
    })
    expect(record.listCostUsd).toBe(0)
    expect(record.billedCostUsd).toBe(0)
    expect(record.costUsd).toBe(0)
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
    expect(line).toContain('list ~$')
  })

  it('shows list and billed when a quota invoice is $0', () => {
    const summary = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        providerCostUsd: 0,
      }),
    ])
    const line = formatUsageSummaryLine(summary)
    expect(line).toContain('list ~$0.7200')
    expect(line).toContain('billed $0.0000')
    expect(summary.totalCostUsd).toBeCloseTo(0.72, 4)
  })

  it('marks list totals partial when an unpriced model is mixed in', () => {
    const summary = summarizeUsageRecords([
      createUsageRecord({
        phase: 'implement',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
      createUsageRecord({
        phase: 'review',
        runtime: 'opencode',
        model: 'mystery/unpriced',
        inputTokens: 10_000,
        outputTokens: 500,
        providerCostUsd: 0.05,
      }),
    ])
    expect(summary.listCostPartial).toBe(true)
    expect(summary.billedCostPartial).toBe(true)
    expect(formatUsageSummaryLine(summary)).toContain('(partial)')
    expect(summary.totalCostUsd).toBeCloseTo(0.14 + 0.05, 4)
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

  it('includes Anthropic cache in list so billed is not inverted above list', () => {
    const uncachedList = estimateCostUsd('sonnet', 30, 14_978)
    const withCache = estimateCostUsd('sonnet', 30, 14_978, 794_133, 50_504)
    expect(uncachedList).toBeCloseTo(0.14984, 5)
    expect(withCache).toBeCloseTo(0.35551, 4)

    const record = createUsageRecord({
      phase: 'implement',
      runtime: 'claude',
      model: 'sonnet',
      inputTokens: 30,
      outputTokens: 14_978,
      cacheReadTokens: 794_133,
      cacheWriteTokens: 50_504,
      providerCostUsd: 0.3,
    })
    expect(record.listCostUsd).toBeCloseTo(0.35551, 4)
    expect(record.billedCostUsd).toBe(0.3)
    expect(record.listCostUsd!).toBeGreaterThan(record.billedCostUsd!)
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

describe('haiku alias pricing per endpoint', () => {
  const ENDPOINT_ENV_KEYS = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'] as const

  beforeEach(() => {
    for (const key of ENDPOINT_ENV_KEYS) delete process.env[key]
  })
  afterEach(() => {
    for (const key of ENDPOINT_ENV_KEYS) delete process.env[key]
  })

  it('prices the haiku alias at Haiku 5.5 rates on the Anthropic API', () => {
    expect(resolvePricingModel('haiku')).toBe('haiku')
    expect(estimateCostUsd('haiku', 1_000_000, 1_000_000)).toBeCloseTo(0.1 + 0.5, 5)
    expect(estimateCostUsd('haiku', 30, 14_978, 794_133, 50_504)).toBeCloseTo(
      (30 / 1_000_000) * 0.1 +
        (14_978 / 1_000_000) * 0.5 +
        (794_133 / 1_000_000) * 0.01 +
        (50_504 / 1_000_000) * 0.125,
      5,
    )
  })

  it('keeps the haiku alias at Haiku 4.5 rates on Bedrock / Vertex', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(resolvePricingModel('haiku')).toBe('claude-haiku-4-5')
    expect(estimateCostUsd('haiku', 1_000_000, 1_000_000)).toBeCloseTo(1 + 5, 5)

    process.env.CLAUDE_CODE_USE_BEDROCK = '0'
    expect(resolvePricingModel('haiku')).toBe('haiku')

    process.env.CLAUDE_CODE_USE_VERTEX = 'true'
    expect(resolvePricingModel('haiku')).toBe('claude-haiku-4-5')
    expect(estimateCostUsd('haiku', 1_000_000, 1_000_000)).toBeCloseTo(1 + 5, 5)
  })

  it('prices the sonnet alias at Sonnet 5.5 on the Anthropic API and 4.5 on Bedrock / Vertex', () => {
    expect(resolvePricingModel('sonnet')).toBe('sonnet')
    expect(estimateCostUsd('sonnet', 1_000_000, 0)).toBeCloseTo(2.0, 5)
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(resolvePricingModel('sonnet')).toBe('claude-sonnet-4-5')
    expect(estimateCostUsd('sonnet', 1_000_000, 0)).toBeCloseTo(3.0, 5)
  })

  it('prices the opus alias at Opus 5.5 on every endpoint', () => {
    expect(estimateCostUsd('opus', 1_000_000, 1_000_000)).toBeCloseTo(4 + 20, 5)
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    expect(resolvePricingModel('opus')).toBe('opus')
    expect(estimateCostUsd('opus', 1_000_000, 1_000_000)).toBeCloseTo(4 + 20, 5)
  })

  it('leaves other models and the pinned claude-haiku-4-5 id untouched', () => {
    expect(resolvePricingModel('sonnet')).toBe('sonnet')
    expect(resolvePricingModel('claude-haiku-4-5')).toBe('claude-haiku-4-5')
    expect(estimateCostUsd('claude-haiku-4-5', 1_000_000, 0)).toBeCloseTo(1.0, 5)
    process.env.CLAUDE_CODE_USE_VERTEX = '1'
    expect(estimateCostUsd('claude-haiku-4-5', 1_000_000, 0)).toBeCloseTo(1.0, 5)
  })

  it('estimates claude-runtime haiku records at 5.5 list instead of 10x high', () => {
    const record = createUsageRecord({
      phase: 'implement',
      runtime: 'claude',
      model: 'haiku',
      inputTokens: 100_000,
      outputTokens: 5_000,
      providerCostUsd: 0,
    })
    expect(record.costSource).toBe('estimated')
    expect(record.costUsd).toBeCloseTo(0.01 + 0.0025, 6)
  })

  it('stops parking small haiku caps 10x early on the Anthropic API', () => {
    // 40k chars → 10k input tokens: ~$0.02024 at 4.5 rates, ~$0.002024 at 5.5 rates.
    const fit = nextCallFitsBudget({
      maxCostUsd: 0.01,
      spentUsd: 0,
      model: 'haiku',
      promptChars: 40_000,
    })
    expect(fit.ok).toBe(true)
  })

  it('still parks a small haiku cap at 4.5 rates on Bedrock / Vertex', () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'
    const fit = nextCallFitsBudget({
      maxCostUsd: 0.01,
      spentUsd: 0,
      model: 'haiku',
      promptChars: 40_000,
    })
    expect(fit.ok).toBe(false)
    if (!fit.ok) {
      expect(fit.predictedUsd).toBeCloseTo(0.02024, 4)
    }
  })
})

export type AgentRunPhase = 'implement' | 'review'

export type LoopUsageRecord = {
  phase: AgentRunPhase
  runtime: 'cline-pass' | 'cursor'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** USD; from provider when available, else estimated from token pricing. */
  costUsd: number
  costSource: 'provider' | 'estimated'
}

export type LoopUsageSummary = {
  records: LoopUsageRecord[]
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
}

/** Official API rates (USD per 1M tokens). */
export const MODEL_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'composer-2.5': { input: 0.5, output: 2.5 },
  'cline-pass/deepseek-v4-flash': { input: 0.14, output: 0.28 },
}

const TOKENS_PER_MILLION = 1_000_000

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const rates = MODEL_PRICING_PER_MILLION[model]
  if (!rates) return null
  return (
    (inputTokens / TOKENS_PER_MILLION) * rates.input +
    (outputTokens / TOKENS_PER_MILLION) * rates.output
  )
}

export function resolveCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providerCostUsd?: number,
): { costUsd: number; costSource: LoopUsageRecord['costSource'] } {
  if (providerCostUsd !== undefined && Number.isFinite(providerCostUsd) && providerCostUsd >= 0) {
    return { costUsd: providerCostUsd, costSource: 'provider' }
  }
  const estimated = estimateCostUsd(model, inputTokens, outputTokens)
  if (estimated !== null) {
    return { costUsd: estimated, costSource: 'estimated' }
  }
  return { costUsd: 0, costSource: 'estimated' }
}

export function createUsageRecord(input: {
  phase: AgentRunPhase
  runtime: LoopUsageRecord['runtime']
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  providerCostUsd?: number
}): LoopUsageRecord {
  const { costUsd, costSource } = resolveCostUsd(
    input.model,
    input.inputTokens,
    input.outputTokens,
    input.providerCostUsd,
  )
  return {
    phase: input.phase,
    runtime: input.runtime,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cacheReadTokens: input.cacheReadTokens ?? 0,
    cacheWriteTokens: input.cacheWriteTokens ?? 0,
    costUsd,
    costSource,
  }
}

export function emptyUsageSummary(): LoopUsageSummary {
  return {
    records: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
  }
}

export function addUsageRecord(
  summary: LoopUsageSummary,
  record: LoopUsageRecord | undefined,
): LoopUsageSummary {
  if (!record) return summary
  const records = [...summary.records, record]
  return summarizeUsageRecords(records)
}

export function summarizeUsageRecords(records: LoopUsageRecord[]): LoopUsageSummary {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCostUsd = 0
  for (const record of records) {
    totalInputTokens += record.inputTokens
    totalOutputTokens += record.outputTokens
    totalCostUsd += record.costUsd
  }
  return {
    records,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: roundUsd(totalCostUsd),
  }
}

export function mergeUsageSummaries(...summaries: LoopUsageSummary[]): LoopUsageSummary {
  return summarizeUsageRecords(summaries.flatMap((s) => s.records))
}

function roundUsd(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function formatUsageSummaryLine(summary: LoopUsageSummary): string {
  if (summary.records.length === 0) {
    return 'usage: (no token data captured)'
  }

  const implement = summarizeUsageRecords(
    summary.records.filter((r) => r.phase === 'implement'),
  )
  const review = summarizeUsageRecords(summary.records.filter((r) => r.phase === 'review'))

  const parts: string[] = [
    `${formatTokenCount(summary.totalInputTokens)} in / ${formatTokenCount(summary.totalOutputTokens)} out`,
    `~$${summary.totalCostUsd.toFixed(4)} total`,
  ]

  if (implement.records.length > 0) {
    parts.push(`~$${implement.totalCostUsd.toFixed(4)} implement`)
  }
  if (review.records.length > 0) {
    parts.push(`~$${review.totalCostUsd.toFixed(4)} review`)
  }

  const hasEstimate = summary.records.some((r) => r.costSource === 'estimated')
  if (hasEstimate) {
    parts.push('(estimate)')
  }

  return `usage: ${parts.join(' | ')}`
}

export function logUsageSummary(prefix: string, summary: LoopUsageSummary): void {
  console.error(`[${prefix}] ${formatUsageSummaryLine(summary)}`)
}

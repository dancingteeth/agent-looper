export type AgentRunPhase = 'implement' | 'review' | 'verify'

export type LoopUsageRecord = {
  phase: AgentRunPhase
  runtime: 'cline-pass' | 'cline' | 'cursor' | 'opencode' | 'pi' | 'codex' | 'dsh' | 'muse' | 'claude'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /**
   * USD used for `maxCostUsd`: provider invoice when it is > $0 (PAYG),
   * otherwise API list estimate so subscription quota $0 still has a cap.
   */
  costUsd: number
  costSource: 'provider' | 'estimated'
  /** Public API list price from `MODEL_PRICING_PER_MILLION` (`:free` → 0). */
  listCostUsd?: number
  /** Runtime-reported invoice; `$0` on included quota. Absent = unknown. */
  billedCostUsd?: number
}

export type LoopUsageSummary = {
  records: LoopUsageRecord[]
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheWriteTokens: number
  /** Budget figure (see `LoopUsageRecord.costUsd`). */
  totalCostUsd: number
  /** Sum of list prices when at least one record has a list figure. */
  totalListCostUsd?: number
  /** True when some records have no list figure (unpriced model). */
  listCostPartial?: boolean
  /** Sum of invoices when at least one record reported billed. */
  totalBilledCostUsd?: number
  /** True when some records have no billed figure. */
  billedCostPartial?: boolean
}

/** Shown under run-report usage: two numbers, one cap. */
export const USAGE_LIST_PRICE_NOTE =
  'List $ is public API list price (token intensity). Billed is the runtime invoice — $0 on included subscription quota, PAYG otherwise. maxCostUsd uses billed when it is > $0, otherwise list so a quota run can still stop.'

export function isHostedFreeModel(model: string): boolean {
  if (model.endsWith(':free')) return true
  const rates = MODEL_PRICING_PER_MILLION[model]
  return rates !== undefined && rates.input === 0 && rates.output === 0
}

export function usageCostsDifferForDisplay(listUsd: number, billedUsd: number): boolean {
  if (listUsd === 0 && billedUsd === 0) return false
  return Math.abs(listUsd - billedUsd) >= 0.00005
}

/** Official API rates (USD per 1M tokens). Kept in sync with CLINE_PASS_LOOP_MODELS / OPENCODE_GO_LOOP_MODELS via modelPricingDrift.test.ts */
export const MODEL_PRICING_PER_MILLION: Record<string, { input: number; output: number }> = {
  'composer-2.5': { input: 0.5, output: 2.5 },
  'grok-4.6': { input: 2.0, output: 6.0 },
  'grok-4.5': { input: 2.0, output: 6.0 },
  'cline-pass/deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'cline-pass/mimo-v2.5': { input: 0.14, output: 0.28 },
  'cline-pass/minimax-m3': { input: 0.14, output: 0.28 },
  'cline-pass/qwen3.7-plus': { input: 0.2, output: 0.4 },
  'cline-pass/kimi-k3': { input: 3.0, output: 15.0 },
  'cline-pass/kimi-k2.7-code': { input: 0.2, output: 0.4 },
  'cline-pass/deepseek-v4-pro': { input: 0.2, output: 0.4 },
  'cline-pass/glm-5.3': { input: 1.4, output: 4.4 },
  'cline-pass/glm-5.2': { input: 0.2, output: 0.4 },
  'cline-pass/kimi-k2.6': { input: 0.2, output: 0.4 },
  'cline-pass/mimo-v2.5-pro': { input: 0.2, output: 0.4 },
  'cline-pass/qwen3.8-max': { input: 2.0, output: 6.0 },
  'cline-pass/qwen3.7-max': { input: 0.25, output: 0.5 },
  'deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'openrouter/deepseek/deepseek-chat': { input: 0.14, output: 0.28 },
  'qwen/qwen3-coder-plus': { input: 0.2, output: 0.8 },
  'openrouter/qwen/qwen3-coder-plus': { input: 0.2, output: 0.8 },
  // OpenCode Go — rates from https://opencode.ai/docs/go/ (subscription quota; estimates for costUsd)
  'opencode-go/deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'opencode-go/hy3': { input: 0.14, output: 0.58 },
  'opencode-go/mimo-v2.5': { input: 0.14, output: 0.28 },
  'opencode-go/minimax-m3': { input: 0.3, output: 1.2 },
  'opencode-go/qwen3.7-plus': { input: 0.4, output: 1.6 },
  'opencode-go/kimi-k3': { input: 3.0, output: 15.0 },
  'opencode-go/kimi-k2.7-code': { input: 0.95, output: 4.0 },
  'opencode-go/deepseek-v4-pro': { input: 0.435, output: 0.87 },
  'opencode-go/glm-5.3': { input: 1.4, output: 4.4 },
  'opencode-go/glm-5.2': { input: 1.4, output: 4.4 },
  'opencode-go/kimi-k2.6': { input: 0.95, output: 4.0 },
  'opencode-go/mimo-v2.5-pro': { input: 0.435, output: 0.87 },
  'opencode-go/qwen3.8-max': { input: 2.0, output: 6.0 },
  'opencode-go/qwen3.7-max': { input: 2.5, output: 7.5 },
  'opencode-go/gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'opencode-go/grok-4.5': { input: 2.0, output: 6.0 },
  // Codex — estimates for costUsd when provider cost is absent (Luna cheap / Terra mid)
  'gpt-5.6-luna': { input: 0.25, output: 2.0 },
  'gpt-5.6-terra': { input: 1.25, output: 10.0 },
  'gpt-5.6-sol': { input: 2.5, output: 15.0 },
  // DSH official DeepSeek (headless agent-default-model)
  'deepseek-official/deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-official/deepseek-v4-flash-vision-exp': { input: 0.14, output: 0.28 },
  'deepseek-official/deepseek-v4-pro': { input: 0.435, output: 0.87 },
  // Muse Spark — PAYG list price (contributor login uses the same estimate)
  'muse-spark-1.1': { input: 1.25, output: 4.25 },
  'muse-spark-1.2': { input: 1.25, output: 4.25 },
  'muse-spark-1.2-contributor': { input: 1.25, output: 4.25 },
  // Claude Code aliases — list-price estimates; spawn prefers subscription quota (`total_cost_usd` when present)
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
  haiku: { input: 1.0, output: 5.0 },
  fable: { input: 15.0, output: 75.0 },
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

export function resolveUsageCosts(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providerCostUsd?: number,
): {
  costUsd: number
  costSource: LoopUsageRecord['costSource']
  listCostUsd?: number
  billedCostUsd?: number
} {
  const hostedFree = isHostedFreeModel(model)
  const estimated = estimateCostUsd(model, inputTokens, outputTokens)
  const listCostUsd = hostedFree ? 0 : (estimated ?? undefined)
  const billedCostUsd =
    providerCostUsd !== undefined && Number.isFinite(providerCostUsd) && providerCostUsd >= 0
      ? providerCostUsd
      : undefined

  if (hostedFree) {
    return {
      costUsd: billedCostUsd ?? 0,
      costSource: billedCostUsd !== undefined ? 'provider' : 'estimated',
      listCostUsd: 0,
      billedCostUsd,
    }
  }
  if (billedCostUsd !== undefined && billedCostUsd > 0) {
    return {
      costUsd: billedCostUsd,
      costSource: 'provider',
      listCostUsd,
      billedCostUsd,
    }
  }
  if (listCostUsd !== undefined) {
    return {
      costUsd: listCostUsd,
      costSource: 'estimated',
      listCostUsd,
      billedCostUsd,
    }
  }
  if (billedCostUsd !== undefined) {
    return {
      costUsd: billedCostUsd,
      costSource: 'provider',
      listCostUsd,
      billedCostUsd,
    }
  }
  return { costUsd: 0, costSource: 'estimated', listCostUsd, billedCostUsd }
}

export function resolveCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providerCostUsd?: number,
): { costUsd: number; costSource: LoopUsageRecord['costSource'] } {
  const resolved = resolveUsageCosts(model, inputTokens, outputTokens, providerCostUsd)
  return { costUsd: resolved.costUsd, costSource: resolved.costSource }
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
  const resolved = resolveUsageCosts(
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
    costUsd: resolved.costUsd,
    costSource: resolved.costSource,
    listCostUsd: resolved.listCostUsd,
    billedCostUsd: resolved.billedCostUsd,
  }
}

export function recordListCostUsd(record: LoopUsageRecord): number | undefined {
  if (typeof record.listCostUsd === 'number' && Number.isFinite(record.listCostUsd)) {
    return record.listCostUsd
  }
  if (record.costSource === 'estimated') return record.costUsd
  return estimateCostUsd(record.model, record.inputTokens, record.outputTokens) ?? undefined
}

export function recordBilledCostUsd(record: LoopUsageRecord): number | undefined {
  if (typeof record.billedCostUsd === 'number' && Number.isFinite(record.billedCostUsd)) {
    return record.billedCostUsd
  }
  if (record.costSource === 'provider') return record.costUsd
  return undefined
}

export function emptyUsageSummary(): LoopUsageSummary {
  return {
    records: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
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
  let totalCacheReadTokens = 0
  let totalCacheWriteTokens = 0
  let totalCostUsd = 0
  let listSum = 0
  let listCount = 0
  let billedSum = 0
  let billedCount = 0
  for (const record of records) {
    totalInputTokens += record.inputTokens
    totalOutputTokens += record.outputTokens
    totalCacheReadTokens += record.cacheReadTokens
    totalCacheWriteTokens += record.cacheWriteTokens
    totalCostUsd += record.costUsd
    const list = recordListCostUsd(record)
    if (list !== undefined) {
      listCount += 1
      listSum += list
    }
    const billed = recordBilledCostUsd(record)
    if (billed !== undefined) {
      billedCount += 1
      billedSum += billed
    }
  }

  return {
    records,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    totalCostUsd: roundUsd(totalCostUsd),
    ...(listCount > 0
      ? {
          totalListCostUsd: roundUsd(listSum),
          ...(listCount < records.length ? { listCostPartial: true } : {}),
        }
      : {}),
    ...(billedCount > 0
      ? {
          totalBilledCostUsd: roundUsd(billedSum),
          ...(billedCount < records.length ? { billedCostPartial: true } : {}),
        }
      : {}),
  }
}

export function mergeUsageSummaries(...summaries: LoopUsageSummary[]): LoopUsageSummary {
  return summarizeUsageRecords(summaries.flatMap((s) => s.records))
}

/**
 * Summarize the source mix of a run's cost: `provider` when every record carries
 * a provider invoice, `estimated` when every record is derived from token
 * pricing (e.g. $0 OpenCode/Codex rows), `mixed` when both appear.
 */
export function costSourceMix(
  summary: LoopUsageSummary,
): 'provider' | 'estimated' | 'mixed' {
  const hasProvider = summary.records.some((r) => r.costSource === 'provider')
  const hasEstimated = summary.records.some((r) => r.costSource === 'estimated')
  if (hasProvider && hasEstimated) return 'mixed'
  if (hasProvider) return 'provider'
  return 'estimated'
}

/** ~4 chars per token; used to price a prompt before the billed session starts. */
export const BUDGET_CHARS_PER_TOKEN = 4
/** Minimum completion reserve so a tiny cap cannot start a turn. */
export const BUDGET_OUTPUT_RESERVE_TOKENS = 2048

export function estimatePromptCostUsd(model: string, promptChars: number): number | null {
  const inputTokens = Math.max(1, Math.ceil(Math.max(0, promptChars) / BUDGET_CHARS_PER_TOKEN))
  return estimateCostUsd(model, inputTokens, BUDGET_OUTPUT_RESERVE_TOKENS)
}

export function lastPhaseCostUsd(
  summary: LoopUsageSummary,
  phase: AgentRunPhase,
): number | undefined {
  for (let index = summary.records.length - 1; index >= 0; index--) {
    const record = summary.records[index]
    if (record?.phase === phase) return record.costUsd
  }
  return undefined
}

export type NextCallBudgetFit =
  | { ok: true }
  | { ok: false; remainingUsd: number; predictedUsd: number }

/**
 * Whether the next billed session is allowed to start. Uses the larger of
 * prompt-priced estimate and the last similar session so a $0.0001 cap cannot
 * launch a composer turn that later invoices $0.24.
 */
export function nextCallFitsBudget(input: {
  maxCostUsd: number | undefined
  spentUsd: number
  model: string
  promptChars: number
  lastSessionCostUsd?: number
}): NextCallBudgetFit {
  if (input.maxCostUsd === undefined) return { ok: true }
  const remainingUsd = input.maxCostUsd - input.spentUsd
  if (remainingUsd <= 0) {
    return { ok: false, remainingUsd, predictedUsd: 0 }
  }
  const fromPrompt = estimatePromptCostUsd(input.model, input.promptChars) ?? 0
  const predictedUsd = Math.max(fromPrompt, input.lastSessionCostUsd ?? 0)
  if (predictedUsd > remainingUsd) {
    return { ok: false, remainingUsd, predictedUsd }
  }
  return { ok: true }
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
  ]

  const listUsd = summary.totalListCostUsd
  const billedUsd = summary.totalBilledCostUsd
  const listLabel = summary.listCostPartial ? ' (partial)' : ''
  const billedLabel = summary.billedCostPartial ? ' (partial)' : ''
  if (listUsd !== undefined && billedUsd !== undefined && usageCostsDifferForDisplay(listUsd, billedUsd)) {
    parts.push(`list ~$${listUsd.toFixed(4)}${listLabel}`)
    parts.push(`billed $${billedUsd.toFixed(4)}${billedLabel}`)
  } else if (listUsd !== undefined) {
    parts.push(`list ~$${listUsd.toFixed(4)} total${listLabel}`)
  } else if (billedUsd !== undefined) {
    parts.push(`billed $${billedUsd.toFixed(4)} total${billedLabel}`)
  } else {
    parts.push(`~$${summary.totalCostUsd.toFixed(4)} total`)
  }

  if (implement.records.length > 0) {
    parts.push(`~$${(implement.totalListCostUsd ?? implement.totalCostUsd).toFixed(4)} implement`)
  }
  if (review.records.length > 0) {
    parts.push(`~$${(review.totalListCostUsd ?? review.totalCostUsd).toFixed(4)} review`)
  }

  const hasCache = summary.records.some((r) => r.cacheReadTokens > 0 || r.cacheWriteTokens > 0)
  if (hasCache) {
    parts.push(
      `cache R ${formatTokenCount(summary.totalCacheReadTokens)} / W ${formatTokenCount(summary.totalCacheWriteTokens)}`,
    )
  }

  const hasEstimate = summary.records.some((r) => r.costSource === 'estimated')
  if (hasEstimate) {
    parts.push('(list price)')
  }

  return `usage: ${parts.join(' | ')}`
}

export function formatUsageRecordLog(record: LoopUsageRecord): string {
  const list =
    record.listCostUsd !== undefined ? `list~$${record.listCostUsd.toFixed(4)}` : undefined
  const billed =
    record.billedCostUsd !== undefined ? `billed $${record.billedCostUsd.toFixed(4)}` : undefined
  const money = [list, billed].filter(Boolean).join(' / ')
  const moneyBit = money || `~$${record.costUsd.toFixed(4)}`
  return `in=${record.inputTokens} out=${record.outputTokens} ${moneyBit} (${record.costSource})`
}

export function logUsageSummary(prefix: string, summary: LoopUsageSummary): void {
  console.error(`[${prefix}] ${formatUsageSummaryLine(summary)}`)
}

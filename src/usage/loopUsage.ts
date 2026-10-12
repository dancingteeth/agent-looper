import { GENERATED_MODEL_PRICING } from './modelPricing.generated.js'
import {
  CLAUDE_HAIKU_MODEL,
  CLAUDE_HAIKU_4_5_MODEL,
  CLAUDE_SONNET_MODEL,
  CLAUDE_SONNET_4_5_MODEL,
} from '../loop/modelCatalog.js'

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
  /** Public API list price from `MODEL_PRICING_PER_MILLION`, including cache (`:free` → 0). */
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
  'List $ is public API list price (uncached input + output + cache read/write). Billed is the runtime invoice — $0 on included subscription quota, PAYG otherwise. maxCostUsd uses billed when it is > $0, otherwise list so a quota run can still stop.'

export function isHostedFreeModel(model: string): boolean {
  if (model.endsWith(':free')) return true
  const rates = MODEL_PRICING_PER_MILLION[model]
  return rates !== undefined && rates.input === 0 && rates.output === 0
}

export function usageCostsDifferForDisplay(listUsd: number, billedUsd: number): boolean {
  if (listUsd === 0 && billedUsd === 0) return false
  return Math.abs(listUsd - billedUsd) >= 0.00005
}

export type ModelTokenRates = {
  input: number
  output: number
  /** USD per 1M cache-read tokens. Default: 0.1 × input (Anthropic / DeepSeek). */
  cacheRead?: number
  /** USD per 1M cache-write tokens. Default: 1.25 × input (Anthropic 5-minute cache). */
  cacheWrite?: number
}

/** Anthropic prompt-cache multipliers when a model omits explicit cache rates. */
const DEFAULT_CACHE_READ_MULT = 0.1
const DEFAULT_CACHE_WRITE_MULT = 1.25

/** Hand-maintained rates for runtimes models.dev does not cover (Cursor, Codex, DSH, Muse, Claude, BYOK). */
const HAND_MAINTAINED_PRICING: Record<string, ModelTokenRates> = {
  'composer-2.5': { input: 0.5, output: 2.5 },
  'grok-4.7': { input: 2.0, output: 6.0, cacheRead: 0.5 },
  'grok-4.6': { input: 2.0, output: 6.0 },
  'grok-4.5': { input: 2.0, output: 6.0 },
  'deepseek/deepseek-chat': { input: 0.32, output: 0.89 },
  'openrouter/deepseek/deepseek-chat': { input: 0.32, output: 0.89 },
  'qwen/qwen3-coder-plus': { input: 0.2, output: 0.8 },
  'openrouter/qwen/qwen3-coder-next': { input: 0.12, output: 0.8, cacheRead: 0.07 },
  // Codex — estimates for costUsd when provider cost is absent (Luna cheap / Terra mid); openai rows on models.dev
  'gpt-5.6-luna': { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
  'gpt-5.6-terra': { input: 2.0, output: 12.0, cacheRead: 0.2, cacheWrite: 2.5 },
  'gpt-5.6-sol': { input: 4.0, output: 20.0, cacheRead: 0.4, cacheWrite: 5.0 },
  'gpt-6-astra': { input: 10.0, output: 50.0, cacheRead: 1.0, cacheWrite: 12.5 },
  // DSH official DeepSeek (headless agent-default-model)
  // `deepseek-flash` is 4.1 (`DeepSeek-V41-Flash`) and the DSH worker default; models.dev lists it at its own rates.
  'deepseek-official/deepseek-flash': { input: 0.15, output: 0.6, cacheRead: 0.003 },
  'deepseek-official/deepseek-v4-flash': { input: 0.15, output: 0.6, cacheRead: 0.003 },
  'deepseek-official/deepseek-v4-flash-vision-exp': { input: 0.15, output: 0.6, cacheRead: 0.003 },
  'deepseek-official/deepseek-v4-pro': { input: 0.66, output: 1.98, cacheRead: 0.022 },
  // Muse Spark — PAYG list price (contributor login uses the same estimate)
  'muse-spark-1.1': { input: 1.25, output: 4.25 },
  'muse-spark-1.2': { input: 1.25, output: 4.25 },
  'muse-spark-1.2-contributor': { input: 1.25, output: 4.25 },
  'muse-spark-1.3': { input: 1.25, output: 4.25 },
  'muse-spark-1.3-contributor': { input: 1.25, output: 4.25 },
  // Claude Code aliases — list-price estimates for the CLI's baked alias map (2.1.296):
  // firstParty: sonnet → claude-sonnet-5-5, opus → claude-opus-5-5, fable → claude-fable-5-1, haiku → claude-haiku-5-5.
  // Spawn prefers subscription quota (`total_cost_usd` when present). Cache rates are models.dev.
  // Bedrock / Vertex still resolve `haiku` and `sonnet` to their 4.5 entries — estimateCostUsd
  // swaps the keys when CLAUDE_CODE_USE_BEDROCK / CLAUDE_CODE_USE_VERTEX is set. Haiku 5.5 also
  // has a models.dev >100k-context tier (0.5 / 2.5); like the generator, we price base rates only.
  sonnet: { input: 2.0, output: 10.0, cacheRead: 0.1, cacheWrite: 2.5 },
  opus: { input: 4.0, output: 20.0, cacheRead: 0.2, cacheWrite: 5.0 },
  haiku: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  fable: { input: 10.0, output: 50.0, cacheRead: 0.25, cacheWrite: 12.5 },
  // Pre-5.5 family rates — priced for the Bedrock / Vertex `haiku` / `sonnet` aliases.
  [CLAUDE_HAIKU_4_5_MODEL]: { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 1.25 },
  [CLAUDE_SONNET_4_5_MODEL]: { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 },
}

/** Official API rates (USD per 1M tokens). Go/ClinePass from models.dev via modelPricingDrift.test.ts */
export const MODEL_PRICING_PER_MILLION: Record<string, ModelTokenRates> = {
  ...GENERATED_MODEL_PRICING,
  ...HAND_MAINTAINED_PRICING,
}

export function isPricedLoopModel(model: string): boolean {
  return MODEL_PRICING_PER_MILLION[model] !== undefined
}

/**
 * Claude Code resolves the bare family aliases per endpoint (its baked catalog): on the
 * Anthropic API they are the latest of each family (Haiku 5.5, Sonnet 5.5, Opus 5.5,
 * Fable 5.1); on Bedrock / Vertex, `haiku` and `sonnet` still resolve to 4.5. The spawned
 * CLI inherits the parent env, so the endpoint switches are visible to pricing (both the
 * recorded estimate and the next-call budget prediction read this).
 */
function claudeCodeOnBedrockOrVertex(): boolean {
  const enabled = (value: string | undefined): boolean =>
    value === '1' || value?.toLowerCase() === 'true'
  return enabled(process.env.CLAUDE_CODE_USE_BEDROCK) || enabled(process.env.CLAUDE_CODE_USE_VERTEX)
}

/** Pricing key for a model id — swaps the `haiku` / `sonnet` aliases when the CLI runs on Bedrock / Vertex. */
export function resolvePricingModel(model: string): string {
  if (!claudeCodeOnBedrockOrVertex()) return model
  if (model === CLAUDE_HAIKU_MODEL) return CLAUDE_HAIKU_4_5_MODEL
  if (model === CLAUDE_SONNET_MODEL) return CLAUDE_SONNET_4_5_MODEL
  return model
}

const TOKENS_PER_MILLION = 1_000_000

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number | null {
  const rates = MODEL_PRICING_PER_MILLION[resolvePricingModel(model)]
  if (!rates) return null
  const cacheReadRate = rates.cacheRead ?? rates.input * DEFAULT_CACHE_READ_MULT
  const cacheWriteRate = rates.cacheWrite ?? rates.input * DEFAULT_CACHE_WRITE_MULT
  return (
    (inputTokens / TOKENS_PER_MILLION) * rates.input +
    (outputTokens / TOKENS_PER_MILLION) * rates.output +
    (cacheReadTokens / TOKENS_PER_MILLION) * cacheReadRate +
    (cacheWriteTokens / TOKENS_PER_MILLION) * cacheWriteRate
  )
}

export function resolveUsageCosts(
  model: string,
  inputTokens: number,
  outputTokens: number,
  providerCostUsd?: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): {
  costUsd: number
  costSource: LoopUsageRecord['costSource']
  listCostUsd?: number
  billedCostUsd?: number
} {
  const hostedFree = isHostedFreeModel(model)
  const estimated = estimateCostUsd(
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  )
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
    input.cacheReadTokens ?? 0,
    input.cacheWriteTokens ?? 0,
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
  return (
    estimateCostUsd(
      record.model,
      record.inputTokens,
      record.outputTokens,
      record.cacheReadTokens,
      record.cacheWriteTokens,
    ) ?? undefined
  )
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

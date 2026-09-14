import {
  costSourceMix,
  isPricedLoopModel,
  lastPhaseCostUsd,
  nextCallFitsBudget,
  usageCostsDifferForDisplay,
  type LoopUsageSummary,
} from '../usage/loopUsage.js'

/** Warn lines for models missing from MODEL_PRICING_PER_MILLION (deduped, skips undefined). */
export function unpricedModelWarnings(models: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const warnings: string[] = []
  for (const model of models) {
    if (model === undefined || seen.has(model)) continue
    seen.add(model)
    if (!isPricedLoopModel(model)) {
      warnings.push(
        `[agent-loop] warn: model "${model}" is not in the priced catalog — costUsd for its turns will read 0.`,
      )
    }
  }
  return warnings
}

type BudgetConfig = { maxCostUsd?: number }

/** True once cumulative cost has crossed `maxCostUsd` (never when no cap is set). */
export function budgetCrossed(config: BudgetConfig, usage: LoopUsageSummary): boolean {
  return config.maxCostUsd !== undefined && usage.totalCostUsd >= config.maxCostUsd
}

/** Completion reason for a run parked because the invoice crossed the cap. Requires `maxCostUsd`. */
export function budgetCompletionReason(maxCostUsd: number, usage: LoopUsageSummary): string {
  const source = costSourceMix(usage)
  const list = usage.totalListCostUsd
  const billed = usage.totalBilledCostUsd
  const split =
    list !== undefined && billed !== undefined && usageCostsDifferForDisplay(list, billed)
      ? ` list ~$${list.toFixed(4)} billed $${billed.toFixed(4)}.`
      : ''
  return (
    `Budget cap reached: totalCostUsd $${usage.totalCostUsd.toFixed(4)} ` +
    `>= maxCostUsd $${maxCostUsd.toFixed(4)} (costSource ${source}).` +
    split
  )
}

/**
 * Worker-only pre-check. Returns a park reason when the predicted cost of the next
 * WORKER call would exceed the remaining budget; undefined when it fits (or no cap).
 */
export function nextWorkerBudgetRefusal(
  config: BudgetConfig,
  usage: LoopUsageSummary,
  model: string,
  promptChars: number,
): string | undefined {
  if (config.maxCostUsd === undefined) return undefined
  const fit = nextCallFitsBudget({
    maxCostUsd: config.maxCostUsd,
    spentUsd: usage.totalCostUsd,
    model,
    promptChars,
    lastSessionCostUsd: lastPhaseCostUsd(usage, 'implement'),
  })
  if (fit.ok) return undefined
  return (
    `Budget cap: next WORKER call predicted ~$${fit.predictedUsd.toFixed(4)} ` +
    `> remaining $${fit.remainingUsd.toFixed(4)} of maxCostUsd $${config.maxCostUsd.toFixed(4)} ` +
    `(did not start the call; costSource ${costSourceMix(usage)}).`
  )
}

import {
  CLINE_PASS_LOOP_MODELS,
  CURSOR_REVIEW_MODEL,
  CURSOR_WORKER_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_LOOP_MODEL,
} from '../loop/loopAgentConfig.js'
import { MODEL_PRICING_PER_MILLION } from './loopUsage.js'

export type ModelPricingDriftIssue =
  | { kind: 'missing-pricing'; model: string }
  | { kind: 'stale-pricing'; model: string }

/** Models the harness may bill against — must have MODEL_PRICING_PER_MILLION entries. */
export function requiredLoopPricingModels(): string[] {
  return [
    CURSOR_WORKER_MODEL,
    CURSOR_REVIEW_MODEL,
    DEFAULT_CLINE_PASS_LOOP_MODEL,
    DEFAULT_CLINE_PASS_ESCALATE_MODEL,
    DEFAULT_CLINE_CREDITS_LOOP_MODEL,
    DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
    ...CLINE_PASS_LOOP_MODELS,
  ]
}

export function collectModelPricingDriftIssues(): ModelPricingDriftIssue[] {
  const required = new Set(requiredLoopPricingModels())
  const issues: ModelPricingDriftIssue[] = []

  for (const model of required) {
    if (!MODEL_PRICING_PER_MILLION[model]) {
      issues.push({ kind: 'missing-pricing', model })
    }
  }

  for (const model of Object.keys(MODEL_PRICING_PER_MILLION)) {
    if (!required.has(model)) {
      issues.push({ kind: 'stale-pricing', model })
    }
  }

  return issues
}

export function checkModelPricingDrift(): { ok: boolean; issues: ModelPricingDriftIssue[] } {
  const issues = collectModelPricingDriftIssues()
  return { ok: issues.length === 0, issues }
}

export function formatModelPricingDriftReport(issues: ModelPricingDriftIssue[]): string {
  if (issues.length === 0) {
    return 'model pricing: OK — MODEL_PRICING_PER_MILLION matches CLINE_PASS_LOOP_MODELS + harness defaults'
  }

  const lines = ['model pricing drift:']
  for (const issue of issues) {
    if (issue.kind === 'missing-pricing') {
      lines.push(`  missing MODEL_PRICING_PER_MILLION entry for ${issue.model}`)
    } else {
      lines.push(`  stale MODEL_PRICING_PER_MILLION entry (not in harness model lists): ${issue.model}`)
    }
  }
  lines.push('  fix: update src/usage/loopUsage.ts and src/loop/loopAgentConfig.ts together')
  return lines.join('\n')
}

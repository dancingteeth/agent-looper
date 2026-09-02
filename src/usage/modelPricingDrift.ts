import {
  CLINE_PASS_LOOP_MODELS,
  CURSOR_REVIEW_MODELS,
  CURSOR_WORKER_MODEL,
  DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_LOOP_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_LOOP_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DSH_VISION_LOOP_MODEL,
  DEFAULT_MUSE_LOOP_MODEL,
  DEFAULT_MUSE_REVIEW_MODEL,
  MUSE_SPARK_1_1_MODEL,
  DEFAULT_CLAUDE_LOOP_MODEL,
  DEFAULT_CLAUDE_ESCALATE_MODEL,
  DEFAULT_CLAUDE_REVIEW_MODEL,
  CLAUDE_HAIKU_MODEL,
  CLAUDE_FABLE_MODEL,
  OPENCODE_GO_LOOP_MODELS,
} from '../loop/loopAgentConfig.js'
import { MODEL_PRICING_PER_MILLION } from './loopUsage.js'

export type ModelPricingDriftIssue =
  | { kind: 'missing-pricing'; model: string }
  | { kind: 'stale-pricing'; model: string }

/** Models the harness may bill against — must have MODEL_PRICING_PER_MILLION entries. */
export function requiredLoopPricingModels(): string[] {
  return [
    CURSOR_WORKER_MODEL,
    ...CURSOR_REVIEW_MODELS,
    DEFAULT_CLINE_PASS_LOOP_MODEL,
    DEFAULT_CLINE_PASS_ESCALATE_MODEL,
    DEFAULT_CLINE_CREDITS_LOOP_MODEL,
    DEFAULT_CLINE_CREDITS_ESCALATE_MODEL,
    DEFAULT_OPENCODE_GO_LOOP_MODEL,
    DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
    DEFAULT_OPENCODE_GO_REVIEW_MODEL,
    DEFAULT_PI_LOOP_MODEL,
    DEFAULT_PI_ESCALATE_MODEL,
    DEFAULT_CODEX_LOOP_MODEL,
    DEFAULT_CODEX_ESCALATE_MODEL,
    DEFAULT_CODEX_REVIEW_MODEL,
    DEFAULT_DSH_LOOP_MODEL,
    DSH_VISION_LOOP_MODEL,
    DEFAULT_DSH_ESCALATE_MODEL,
    DEFAULT_DSH_REVIEW_MODEL,
    DEFAULT_MUSE_LOOP_MODEL,
    DEFAULT_MUSE_REVIEW_MODEL,
    MUSE_SPARK_1_1_MODEL,
    DEFAULT_CLAUDE_LOOP_MODEL,
    DEFAULT_CLAUDE_ESCALATE_MODEL,
    DEFAULT_CLAUDE_REVIEW_MODEL,
    CLAUDE_HAIKU_MODEL,
    CLAUDE_FABLE_MODEL,
    ...CLINE_PASS_LOOP_MODELS,
    ...OPENCODE_GO_LOOP_MODELS,
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
    return 'model pricing: OK — MODEL_PRICING_PER_MILLION matches CLINE_PASS / OPENCODE_GO lists + harness defaults'
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

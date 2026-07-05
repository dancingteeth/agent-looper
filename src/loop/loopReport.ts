import fs from 'node:fs'
import path from 'node:path'
import type { AgentLoopResult } from './agentLoop.js'
import type { LoopBatchResult } from './loopBatch.js'
import { parseReviewMarkdown } from '../review/reviewVerdict.js'
import { formatUsageSummaryLine, type LoopUsageSummary } from '../usage/loopUsage.js'

const TELEGRAM_MAX_MESSAGE = 4096
const VERIFY_SNIPPET_MAX = 600

export type LoopReportReview = {
  verdict: string
  risk: string
  blockersCount: number
}

function repoLabel(repoRoot: string): string {
  return path.basename(repoRoot)
}

function relPath(repoRoot: string, target: string): string {
  return path.relative(repoRoot, target) || '.'
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function formatVerifySnippet(result: AgentLoopResult): string | undefined {
  const verify = result.lastVerify
  if (!verify || verify.complete) return undefined
  const output = [verify.stdout, verify.stderr].filter((s) => s.trim()).join('\n')
  if (!output.trim()) return undefined
  return truncate(output, VERIFY_SNIPPET_MAX)
}

export function readLatestLoopReview(loopDir: string): LoopReportReview | undefined {
  const reviewPath = path.join(loopDir, 'review.md')
  if (!fs.existsSync(reviewPath)) return undefined
  try {
    const parsed = parseReviewMarkdown(fs.readFileSync(reviewPath, 'utf8'))
    return {
      verdict: parsed.verdict,
      risk: parsed.risk,
      blockersCount: parsed.blockers.length,
    }
  } catch {
    return undefined
  }
}

function formatReviewLine(review: LoopReportReview | undefined): string | undefined {
  if (!review) return undefined
  const blockers =
    review.blockersCount > 0 ? `, ${review.blockersCount} blocker(s)` : ''
  return `Review: ${review.verdict} (risk ${review.risk}${blockers})`
}

export function formatLoopCompletionReport(input: {
  repoRoot: string
  bundleLabel: string
  result: AgentLoopResult
  loopDir: string
}): string {
  const { repoRoot, bundleLabel, result, loopDir } = input
  const status = result.complete ? '✅ Loop complete' : '❌ Loop failed'
  const lines = [
    status,
    `Repo: ${repoLabel(repoRoot)}`,
    `Bundle: ${bundleLabel}`,
    `Iterations: ${result.iterations}`,
    `Reason: ${result.completionReason}`,
    formatUsageSummaryLine(result.usage),
  ]

  const reviewLine = formatReviewLine(readLatestLoopReview(loopDir))
  if (reviewLine) lines.push(reviewLine)

  const verifySnippet = formatVerifySnippet(result)
  if (verifySnippet) {
    lines.push('', 'Last verifier output:', verifySnippet)
  }

  return truncate(lines.join('\n'), TELEGRAM_MAX_MESSAGE)
}

export function formatBatchCompletionReport(input: {
  repoRoot: string
  batchLabel: string
  result: LoopBatchResult
}): string {
  const { repoRoot, batchLabel, result } = input
  const status = result.complete ? '✅ Batch complete' : '❌ Batch failed'
  const lines = [
    status,
    `Repo: ${repoLabel(repoRoot)}`,
    `Batch: ${batchLabel}`,
    `Loops run: ${result.loopsRun}`,
    `Reason: ${result.completionReason}`,
    formatUsageSummaryLine(result.usage),
  ]

  if (result.iterations.length > 0) {
    lines.push('', 'Loops:')
    for (const entry of result.iterations) {
      const icon = entry.result.complete ? '✓' : '✗'
      const label = relPath(repoRoot, entry.loopDir)
      lines.push(
        `${icon} ${label} — ${entry.result.iterations} iter — ${entry.result.completionReason}`,
      )
    }
  }

  return truncate(lines.join('\n'), TELEGRAM_MAX_MESSAGE)
}

export function formatTelegramReportForUsageOnly(input: {
  title: string
  repoRoot: string
  targetLabel: string
  usage: LoopUsageSummary
  reason: string
}): string {
  const lines = [
    input.title,
    `Repo: ${repoLabel(input.repoRoot)}`,
    `Target: ${input.targetLabel}`,
    `Reason: ${input.reason}`,
    formatUsageSummaryLine(input.usage),
  ]
  return truncate(lines.join('\n'), TELEGRAM_MAX_MESSAGE)
}

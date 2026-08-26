import fs from 'node:fs'
import path from 'node:path'
import type { AgentLoopResult } from './agentLoop.js'
import type { LoopBatchResult } from './loopBatch.js'
import { captureGitWorkspaceSnapshot } from './loopGit.js'
import { parseReviewMarkdown, blockingBlockers } from '../review/reviewVerdict.js'
import { formatUsageSummaryLine } from '../usage/loopUsage.js'
import {
  formatFailureDomainLine,
  readLatestFailureDomain,
} from './loopFailureDomain.js'

const TELEGRAM_MAX_MESSAGE = 4096
const VERIFY_SNIPPET_MAX = 600

export type LoopReportReview = {
  verdict: string
  risk: string
  blockersCount: number
  gatingBlockersCount: number
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

export function resolveLatestReviewPath(loopDir: string): string | undefined {
  let latest: { path: string; cycle: number } | undefined

  try {
    for (const entry of fs.readdirSync(loopDir)) {
      let cycle: number | undefined
      if (entry === 'review.md') {
        cycle = 1
      } else {
        const match = entry.match(/^review\.(\d+)\.md$/)
        if (!match) continue
        cycle = Number(match[1])
      }

      if (!latest || cycle > latest.cycle) {
        latest = { path: path.join(loopDir, entry), cycle }
      }
    }
  } catch {
    return undefined
  }

  return latest?.path
}

export function readLatestLoopReview(loopDir: string): LoopReportReview | undefined {
  const reviewPath = resolveLatestReviewPath(loopDir)
  if (!reviewPath) return undefined
  try {
    const parsed = parseReviewMarkdown(fs.readFileSync(reviewPath, 'utf8'))
    return {
      verdict: parsed.verdict,
      risk: parsed.risk,
      blockersCount: parsed.blockers.length,
      gatingBlockersCount: blockingBlockers(parsed).length,
    }
  } catch {
    return undefined
  }
}

export function readLatestReviewContent(loopDir: string): string | undefined {
  const reviewPath = resolveLatestReviewPath(loopDir)
  if (!reviewPath) return undefined
  try {
    const content = fs.readFileSync(reviewPath, 'utf8').trim()
    return content.length > 0 ? content : undefined
  } catch {
    return undefined
  }
}

export function reviewDocumentFilename(loopDir: string): string {
  const reviewPath = resolveLatestReviewPath(loopDir)
  if (!reviewPath) return 'review.md'
  return path.basename(reviewPath)
}

function formatReviewLine(
  review: LoopReportReview | undefined,
  advisoryBlockers: boolean,
): string | undefined {
  if (!review) return undefined
  const blockers =
    review.blockersCount > 0 ? `, ${review.blockersCount} blocker(s)` : ''
  const gating =
    review.gatingBlockersCount > 0 ? `, ${review.gatingBlockersCount} gating` : ''
  const advisory =
    advisoryBlockers && review.verdict === 'BLOCKERS'
      ? ' [advisory — no error+impact blockers]'
      : ''
  return `Review: ${review.verdict} (risk ${review.risk}${blockers}${gating})${advisory}`
}

function formatGitStatusLine(repoRoot: string): string | undefined {
  const git = captureGitWorkspaceSnapshot(repoRoot)
  if (git.statusPorcelain === '(clean)' || git.statusPorcelain === '(git unavailable)') {
    return undefined
  }
  return `Uncommitted changes:\n${truncate(git.statusPorcelain, 1200)}`
}

function formatSuccessNextSteps(repoRoot: string): string[] {
  const lines = ['', 'Suggested next steps:', '  git status', '  git add -p && git commit', '  git push']
  const git = captureGitWorkspaceSnapshot(repoRoot)
  if (git.statusPorcelain !== '(clean)' && git.statusPorcelain !== '(git unavailable)') {
    lines.push('', 'Working tree (short):', truncate(git.statusPorcelain, 800))
  }
  return lines
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
    `Status: ${result.status}`,
    `Repo: ${repoLabel(repoRoot)}`,
    `Bundle: ${bundleLabel}`,
    `Iterations: ${result.iterations}`,
    `Reason: ${result.completionReason}`,
    formatUsageSummaryLine(result.usage),
  ]

  const reviewLine = formatReviewLine(
    readLatestLoopReview(loopDir),
    result.reviewAdvisoryBlockers === true,
  )
  if (reviewLine) lines.push(reviewLine)

  if (result.reviewAdvisoryBlockers) {
    lines.push(
      'Note: review BLOCKERS are advisory only — warning/none-impact items, or reviewGate=false.',
    )
  }

  if (result.innerAgentIncomplete) {
    lines.push('Note: inner agent hit clineMaxIterations; outer verifier still passed.')
  }

  if (result.complete) {
    if (result.hitlCheckTaskUuid) {
      lines.push(`HITL: uuid:${result.hitlCheckTaskUuid}`)
    }
    lines.push(...formatSuccessNextSteps(repoRoot))
  } else {
    lines.push(`→ resume: agent-loop run ${bundleLabel}`)
    if (result.hitlCheckTaskUuid) {
      lines.push(`HITL: uuid:${result.hitlCheckTaskUuid}`)
    }
    const failureDomain = formatFailureDomainLine(readLatestFailureDomain(loopDir))
    if (failureDomain) lines.push(failureDomain)
    const gitStatus = formatGitStatusLine(repoRoot)
    if (gitStatus) lines.push('', gitStatus)
  }

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

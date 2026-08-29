import fs from 'node:fs'
import type { LoopIterationLog } from './agentLoop.js'
import { AGENT_SDK_VERIFY_COMMAND, type FailureDomainEntry, type FailureDomainReason } from './loopFailureDomain.js'
import { summarizeUsageRecords, type LoopUsageSummary } from '../usage/loopUsage.js'

export type IterationDurationsMs = {
  worker?: number
  verify?: number
  judge?: number
}

export type LoopRunScoreboard = {
  iterations: number
  /** Iterations that actually ran the shell checker (not a hung worker). */
  checkerRounds: number
  verifyFails: number
  /** Hung / wall-clock worker rows (`command: '(agent SDK)'`). */
  workerFaults: number
  reviewsRun: number
  reviewKills: number
  sdkRetries: number
  workerMs: number
  verifyMs: number
  judgeMs: number
  implementCostUsd: number
  reviewCostUsd: number
  hasCost: boolean
  failureCounts: Record<FailureDomainReason, number>
  hitl: boolean
}

const ZERO_FAILURE_COUNTS: Record<FailureDomainReason, number> = {
  stagnation: 0,
  max_iterations: 0,
  review_gate: 0,
  review_gate_hitl: 0,
  meta_probe_failed: 0,
  agent_error: 0,
}

export function emptyFailureCounts(): Record<FailureDomainReason, number> {
  return { ...ZERO_FAILURE_COUNTS }
}

export function readLoopLogEntries(logPath: string): LoopIterationLog[] {
  if (!fs.existsSync(logPath)) return []
  const entries: LoopIterationLog[] = []
  for (const line of fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)) {
    try {
      entries.push(JSON.parse(line) as LoopIterationLog)
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

export function countFailureReasons(
  entries: FailureDomainEntry[],
): Record<FailureDomainReason, number> {
  const counts = emptyFailureCounts()
  for (const entry of entries) {
    counts[entry.reason] += 1
  }
  return counts
}

function reviewKilled(entry: LoopIterationLog): boolean {
  const verdict = entry.review?.verdict
  return verdict === 'BLOCKERS' || verdict === 'UNKNOWN'
}

export function isAgentSdkVerify(verify: LoopIterationLog['verify']): boolean {
  return verify.command === AGENT_SDK_VERIFY_COMMAND
}

export function buildLoopRunScoreboard(input: {
  entries: LoopIterationLog[]
  failureDomains: FailureDomainEntry[]
  usage: LoopUsageSummary
}): LoopRunScoreboard {
  const { entries, failureDomains, usage } = input
  const implement = summarizeUsageRecords(usage.records.filter((r) => r.phase === 'implement'))
  const review = summarizeUsageRecords(usage.records.filter((r) => r.phase === 'review'))
  const failureCounts = countFailureReasons(failureDomains)
  const checkerEntries = entries.filter((e) => !isAgentSdkVerify(e.verify))

  return {
    iterations: entries.length,
    checkerRounds: checkerEntries.length,
    verifyFails: checkerEntries.filter((e) => !e.verify.complete).length,
    workerFaults: entries.filter((e) => isAgentSdkVerify(e.verify)).length,
    reviewsRun: entries.filter((e) => e.review).length,
    reviewKills: entries.filter((e) => reviewKilled(e)).length,
    sdkRetries: entries.reduce((sum, e) => sum + (e.sdkRetries ?? 0), 0),
    workerMs: entries.reduce((sum, e) => sum + (e.durationsMs?.worker ?? 0), 0),
    verifyMs: entries.reduce((sum, e) => sum + (e.durationsMs?.verify ?? 0), 0),
    judgeMs: entries.reduce((sum, e) => sum + (e.durationsMs?.judge ?? 0), 0),
    implementCostUsd: implement.totalCostUsd,
    reviewCostUsd: review.totalCostUsd,
    hasCost: usage.records.length > 0,
    failureCounts,
    hitl: failureCounts.review_gate_hitl > 0,
  }
}

export function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return `${m}m ${String(rem).padStart(2, '0')}s`
}

function failureRollup(counts: Record<FailureDomainReason, number>): string {
  const parts: string[] = []
  for (const reason of Object.keys(ZERO_FAILURE_COUNTS) as FailureDomainReason[]) {
    const n = counts[reason]
    if (n > 0) parts.push(`${reason}×${n}`)
  }
  return parts.length > 0 ? parts.join(', ') : 'none'
}

/** Human-readable scoreboard for run-report.md. */
export function formatScoreboardMarkdown(board: LoopRunScoreboard): string[] {
  const referee =
    board.reviewsRun === 0
      ? 'no review this run'
      : `${board.reviewKills} of ${board.reviewsRun} (kill rate ${Math.round((board.reviewKills / board.reviewsRun) * 100)}%)`
  const checker =
    board.checkerRounds === 0
      ? 'n/a (writer hung before check)'
      : `${board.verifyFails} of ${board.checkerRounds}`

  const lines = [
    '## Report card',
    '',
    '| | |',
    '| --- | --- |',
    `| Iterations | ${board.iterations} |`,
    `| Checker sent back | ${checker} |`,
    `| Writer hung | ${board.workerFaults} |`,
    `| Referee bounce-backs | ${referee} |`,
    `| Needed you | ${board.hitl ? 'yes (HITL)' : 'no'} |`,
    `| Writer time | ${formatDurationMs(board.workerMs)} |`,
    `| Checker time | ${formatDurationMs(board.verifyMs)} |`,
    `| Referee time | ${formatDurationMs(board.judgeMs)} |`,
  ]

  if (board.hasCost) {
    lines.push(
      `| Writer $ | ~$${board.implementCostUsd.toFixed(4)} |`,
      `| Referee $ | ~$${board.reviewCostUsd.toFixed(4)} |`,
    )
  }

  lines.push(
    `| SDK retries | ${board.sdkRetries} |`,
    `| Stops | ${failureRollup(board.failureCounts)} |`,
    '',
  )
  return lines
}

/** One Telegram / completion-report line. */
export function formatScoreboardTelegramLine(board: LoopRunScoreboard): string {
  const bounce =
    board.reviewsRun === 0
      ? 'referee bounce n/a'
      : `referee bounce ${board.reviewKills}/${board.reviewsRun}`
  const checker =
    board.checkerRounds === 0
      ? 'checker sent back n/a'
      : `checker sent back ${board.verifyFails}`
  const hung = board.workerFaults > 0 ? ` · writer hung ${board.workerFaults}` : ''
  const money = board.hasCost
    ? ` · writer ~$${board.implementCostUsd.toFixed(4)} / referee ~$${board.reviewCostUsd.toFixed(4)}`
    : ''
  return (
    `Report card: ${board.iterations} iters · ${checker}${hung}` +
    ` · ${bounce} · needed you: ${board.hitl ? 'yes' : 'no'}${money}`
  )
}

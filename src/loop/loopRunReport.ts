import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentLoopResult, LoopIterationLog } from './agentLoop.js'
import { deriveLoopRunStatus } from './agentLoop.js'
import type { LoopConfig } from './loopConfig.js'
import {
  isHitlWaitingFailureDomain,
  readLatestFailureDomain,
} from './loopFailureDomain.js'
import { gitDiffStatSinceBranchBase } from '../review/loopPostReview.js'
import { readLatestLoopReview, resolveLatestReviewPath } from './loopReport.js'
import { addUsageRecord, emptyUsageSummary, formatUsageSummaryLine } from '../usage/loopUsage.js'
import { formatToolSummary, type TranscriptEvent } from '../stream/streamCollect.js'
import { loopRuntimeLabel } from '../agents/agentRunner.js'

export const RUN_REPORT_FILENAME = 'run-report.md'
export const TRANSCRIPT_FILENAME = 'transcript.ndjson'

export function readLoopLogEntries(logPath: string): LoopIterationLog[] {
  if (!fs.existsSync(logPath)) return []
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
  const entries: LoopIterationLog[] = []
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as LoopIterationLog)
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

export function readTranscriptEvents(transcriptPath: string): TranscriptEvent[] {
  if (!fs.existsSync(transcriptPath)) return []
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean)
  const events: TranscriptEvent[] = []
  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as TranscriptEvent)
    } catch {
      // skip malformed lines
    }
  }
  return events
}

/** Rebuild AgentLoopResult from an on-disk log.ndjson (for export-run). */
export function reconstructAgentLoopResultFromLog(
  logPath: string,
  options: { completionNote?: string; config?: LoopConfig } = {},
): AgentLoopResult {
  const entries = readLoopLogEntries(logPath)
  if (entries.length === 0) {
    throw new Error(`No iterations found in ${logPath}`)
  }

  const last = entries.at(-1)!
  let usage = emptyUsageSummary()
  for (const entry of entries) {
    usage = addUsageRecord(usage, entry.usage)
  }

  const lastVerify = last.finalVerify ?? last.verify
  const note = options.completionNote ?? 'Regenerated from log.ndjson.'
  let complete = lastVerify.complete
  let completionReason = complete ? lastVerify.reason : `${note} ${lastVerify.reason}`

  if (complete && options.config?.reviewGate && last.review) {
    if (last.review.verdict === 'BLOCKERS' || last.review.verdict === 'UNKNOWN') {
      complete = false
      completionReason = `Review gate: ${last.review.verdict} after verify passed. ${note}`
    }
  }

  const loopDir = path.dirname(logPath)
  const reviewEscalatedToHitl = isHitlWaitingFailureDomain(readLatestFailureDomain(loopDir))

  return {
    complete,
    status: deriveLoopRunStatus({ complete, reviewEscalatedToHitl }),
    iterations: last.iteration,
    completionReason,
    lastVerify,
    logPath,
    usage,
    ...(reviewEscalatedToHitl ? { reviewEscalatedToHitl: true } : {}),
  }
}

function bundleTitle(loopDir: string): string {
  return path.basename(loopDir)
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function relativeLink(baseDir: string | undefined, filePath: string): string {
  if (!baseDir) return filePath
  const rel = path.relative(baseDir, filePath)
  return rel || path.basename(filePath)
}

function formatVerifyStep(
  verify: LoopIterationLog['verify'],
  options: { verifyLog?: LoopIterationLog['verifyLog']; baseDir?: string } = {},
): string {
  const status = verify.complete ? 'PASS' : 'FAIL'
  const header = `**${status}** (exit ${verify.exitCode}) — \`${verify.command}\``

  const links: string[] = []
  if (options.verifyLog?.stdoutPath) {
    links.push(`stdout: ${relativeLink(options.baseDir, options.verifyLog.stdoutPath)}`)
  }
  if (options.verifyLog?.stderrPath) {
    links.push(`stderr: ${relativeLink(options.baseDir, options.verifyLog.stderrPath)}`)
  }
  if (links.length > 0) {
    return [header, '', ...links].join('\n')
  }

  const tail = truncate([verify.stdout, verify.stderr].filter(Boolean).join('\n'), 400)
  return `${header}${tail ? `\n\n\`\`\`\n${tail}\n\`\`\`` : ''}`
}

export type BuildRunReportInput = {
  ctx: RepoContext
  loopDir: string
  goal: string
  config: LoopConfig
  result: AgentLoopResult
  workerModel: string
  reviewRuntime: LoopConfig['runtime']
  reviewModel: string
  runtime: LoopConfig['runtime']
}

export function buildRunReportMarkdown(input: BuildRunReportInput): string {
  const entries = readLoopLogEntries(input.result.logPath)
  const last = entries.at(-1)
  const review = readLatestLoopReview(input.loopDir)
  const reviewPath = resolveLatestReviewPath(input.loopDir)
  const relBundle = path.relative(input.ctx.repoRoot, input.loopDir)
  const usageLine = formatUsageSummaryLine(input.result.usage)

  let diffStat = '(unavailable)'
  try {
    diffStat = gitDiffStatSinceBranchBase(input.ctx) || '(no diff)'
  } catch {
    // ignore
  }

  const lines: string[] = [
    '---',
    'tags:',
    '  - documentation',
    '  - loops',
    '  - run-report',
    '---',
    `# Loop run report — ${bundleTitle(input.loopDir)}`,
    '',
    `**Bundle:** \`${relBundle}\``,
    `**Outcome:** ${input.result.complete ? 'complete' : 'incomplete'} in ${input.result.iterations} iteration(s)`,
    `**Reason:** ${input.result.completionReason}`,
    `**Usage:** ${usageLine}`,
    '',
    '## Models',
    '',
    `| Role | Runtime | Model |`,
    `| --- | --- | --- |`,
    `| Worker | ${loopRuntimeLabel(input.runtime)} | ${input.workerModel} |`,
    `| Judge | ${loopRuntimeLabel(input.reviewRuntime)} | ${input.reviewModel} |`,
    '',
    ...(input.config.costPreset
      ? [
          `**costPreset:** \`${input.config.costPreset}\` — frozen at parse (not Auto).`,
          '',
        ]
      : []),
    '## Why this is a loop (not a one-shot prompt)',
    '',
    '- **Fresh worker context** each iteration — progress lives in git + files, not chat memory.',
    '- **Shell verify is the hard gate** — completion requires exit `0` from your `verify` command.',
    ...(input.config.reviewGate
      ? ['- **Review gate armed** — gating blockers would re-open the fix loop (up to `maxReviewCycles`).']
      : []),
    ...(input.config.reviewGate
      ? []
      : input.config.postQualityReview === false
        ? ['- Post-success review was **off** for this run.']
        : ['- Post-success review ran (advisory unless `reviewGate` is on).']),
    `- **Stagnation cap** — identical verify failures abort after \`stagnationThreshold\` (${input.config.stagnationThreshold}).`,
  ]

  if (review) {
    lines.push(
      '',
      '## Review',
      '',
      `Latest: \`${reviewPath ? path.basename(reviewPath) : 'review.md'}\` — **${review.verdict}**, risk=${review.risk}, gating blockers=${review.gatingBlockersCount}`,
    )
  }

  lines.push('', '## Iteration timeline', '')

  if (entries.length === 0) {
    lines.push('_(No `log.ndjson` entries — run may have aborted before logging.)_')
  }

  for (const entry of entries) {
    lines.push(`### Iteration ${entry.iteration} — ${entry.at}`)
    lines.push('')
    lines.push(`- **Git:** \`${entry.branch}\` @ \`${entry.shortSha}\``)
    if (entry.model) {
      lines.push(
        `- **Worker:** ${entry.model}${entry.reasoningEffort ? ` (reasoning ${entry.reasoningEffort})` : ''}`,
      )
    }
    if (entry.workerSession) {
      const ref = entry.workerSession
      const parts = [
        ref.runId ? `run_id=${ref.runId}` : undefined,
        ref.sessionId ? `session_id=${ref.sessionId}` : undefined,
        ref.agentId ? `agent_id=${ref.agentId}` : undefined,
      ].filter(Boolean)
      if (parts.length > 0) {
        lines.push(`- **Session:** ${ref.provider} — ${parts.join(', ')}`)
      }
    }
    if (entry.toolSummary) {
      lines.push(`- **Tools:** ${formatToolSummary(entry.toolSummary)}`)
    }
    lines.push('- **Verify:**', '', formatVerifyStep(entry.verify, { verifyLog: entry.verifyLog, baseDir: input.loopDir }))
    if (entry.finalVerify) {
      lines.push('- **Final verify:**', '', formatVerifyStep(entry.finalVerify, { baseDir: input.loopDir }))
    }
    if (entry.review) {
      lines.push(
        `- **Review:** ${entry.review.verdict}, risk=${entry.review.risk}, blockers=${entry.review.blockersCount}${entry.review.reviewCycle ? ` (cycle ${entry.review.reviewCycle})` : ''}`,
      )
    }
    if (entry.usage) {
      lines.push(
        `- **Worker usage:** ${entry.usage.inputTokens} in / ${entry.usage.outputTokens} out (~$${entry.usage.costUsd.toFixed(4)})`,
      )
    }
    if (entry.assistantPreview) {
      lines.push('- **Worker summary:**', '', truncate(entry.assistantPreview, 800))
    }
    lines.push('')
  }

  lines.push(
    '## Git diff stat (branch base)',
    '',
    '```',
    diffStat,
    '```',
    '',
    '## Artifacts in this bundle',
    '',
    '| File | Purpose |',
    '| --- | --- |',
    '| `GOAL.md` | Frozen loop spec |',
    '| `loop.json` | Runtime + verify + gates |',
    '| `log.ndjson` | Machine-readable iteration log |',
    '| `run-report.md` | This human-readable report |',
    '| `transcript.ndjson` | Tool timeline (when enabled) |',
    '| `review.md` | Judge output (when review ran) |',
    '',
    '## Goal (excerpt)',
    '',
    truncate(input.goal, 1200),
  )

  if (last) {
    lines.push('', `**Last logged at:** ${last.at}`)
  }

  return `${lines.join('\n')}\n`
}

export type WriteRunReportInput = BuildRunReportInput & {
  transcriptEvents?: TranscriptEvent[]
}

export type WriteRunReportResult = {
  reportPath: string
  transcriptPath?: string
}

export function writeRunReportArtifacts(input: WriteRunReportInput): WriteRunReportResult {
  const reportPath = path.join(input.loopDir, RUN_REPORT_FILENAME)
  fs.writeFileSync(reportPath, buildRunReportMarkdown(input), 'utf8')

  let transcriptPath: string | undefined
  if (input.config.exportTranscript && input.transcriptEvents && input.transcriptEvents.length > 0) {
    transcriptPath = path.join(input.loopDir, TRANSCRIPT_FILENAME)
    const body = input.transcriptEvents.map((event) => JSON.stringify(event)).join('\n')
    fs.writeFileSync(transcriptPath, `${body}\n`, 'utf8')
  }

  return { reportPath, transcriptPath }
}

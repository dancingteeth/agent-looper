import fs from 'node:fs'
import path from 'node:path'
import type { AgentLoopResult } from '../loop/agentLoop.js'
import {
  readLatestReviewContent,
  resolveLatestReviewPath,
} from '../loop/loopReport.js'
import { FAILURE_DOMAINS_FILENAME } from '../loop/loopFailureDomain.js'
import { RUN_REPORT_FILENAME } from '../loop/loopRunReport.js'

/** Durable, commit-friendly snapshot of a finished loop (not gitignored). */
export const LOOP_EXPORTS_DIRNAME = '.cursor/loop-exports'

export const EXPORT_META_FILENAME = 'meta.json'
export const EXPORT_SUMMARY_FILENAME = 'SUMMARY.md'
export const EXPORT_REVIEW_FILENAME = 'review.md'
export const EXPORT_RUN_REPORT_FILENAME = 'run-report.md'
export const EXPORT_FAILURE_DOMAINS_FILENAME = 'failure-domains.ndjson'
export const EXPORT_LOG_TAIL_FILENAME = 'log-tail.ndjson'

export type LoopExportMeta = {
  v: 1
  loopRel: string
  complete: boolean
  status: string
  completionReason: string
  iterations: number
  exportedAt: string
  hitlCheckTaskUuid?: string
}

export type WriteLoopExportPackResult = {
  exportDir: string
  metaPath: string
  files: string[]
}

export function loopExportSlug(loopRel: string): string {
  const cleaned = loopRel
    .replace(/^\.cursor\/loops\//, '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const slug = cleaned.replace(/[^a-zA-Z0-9._/-]+/g, '-').replace(/\/+/g, '__')
  return slug || 'loop'
}

export function resolveLoopExportDir(repoRoot: string, loopRel: string): string {
  return path.join(repoRoot, LOOP_EXPORTS_DIRNAME, loopExportSlug(loopRel))
}

/** Relative export-pack dirs that already exist on disk (for batch notify payloads). */
export function resolveExistingExportPackRels(
  repoRoot: string,
  loopDirs: readonly string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const loopDir of loopDirs) {
    const loopRel = path.relative(repoRoot, loopDir) || '.'
    const exportDir = resolveLoopExportDir(repoRoot, loopRel)
    if (!fs.existsSync(exportDir)) continue
    const rel = path.relative(repoRoot, exportDir)
    if (seen.has(rel)) continue
    seen.add(rel)
    out.push(rel)
  }
  return out
}

function copyIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  return true
}

function writeLogTail(logPath: string, dest: string, maxLines = 40): boolean {
  if (!fs.existsSync(logPath)) return false
  const lines = fs.readFileSync(logPath, 'utf8').trimEnd().split('\n')
  const tail = lines.slice(-maxLines).join('\n')
  if (!tail.trim()) return false
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, `${tail}\n`, 'utf8')
  return true
}

/**
 * Write a curated export pack under `.cursor/loop-exports/<slug>/`.
 * In-loop artifacts stay gitignored; this pack is the cloud/PR audit surface.
 */
export function writeLoopExportPack(input: {
  repoRoot: string
  loopDir: string
  result: Pick<
    AgentLoopResult,
    'complete' | 'status' | 'completionReason' | 'iterations' | 'hitlCheckTaskUuid'
  >
}): WriteLoopExportPackResult {
  const loopRel = path.relative(input.repoRoot, input.loopDir) || '.'
  const exportDir = resolveLoopExportDir(input.repoRoot, loopRel)
  fs.mkdirSync(exportDir, { recursive: true })

  const files: string[] = []
  const meta: LoopExportMeta = {
    v: 1,
    loopRel,
    complete: input.result.complete,
    status: input.result.status,
    completionReason: input.result.completionReason,
    iterations: input.result.iterations,
    exportedAt: new Date().toISOString(),
    hitlCheckTaskUuid: input.result.hitlCheckTaskUuid,
  }
  const metaPath = path.join(exportDir, EXPORT_META_FILENAME)
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
  files.push(EXPORT_META_FILENAME)

  const summary = [
    `# Loop export: ${loopRel}`,
    '',
    `- **Complete:** ${meta.complete}`,
    `- **Status:** ${meta.status}`,
    `- **Iterations:** ${meta.iterations}`,
    `- **Exported:** ${meta.exportedAt}`,
    '',
    '## Reason',
    '',
    meta.completionReason,
    ...(meta.hitlCheckTaskUuid ? ['', `HITL: ${meta.hitlCheckTaskUuid}`] : []),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(exportDir, EXPORT_SUMMARY_FILENAME), summary, 'utf8')
  files.push(EXPORT_SUMMARY_FILENAME)

  if (
    copyIfExists(
      path.join(input.loopDir, RUN_REPORT_FILENAME),
      path.join(exportDir, EXPORT_RUN_REPORT_FILENAME),
    )
  ) {
    files.push(EXPORT_RUN_REPORT_FILENAME)
  }

  const reviewPath = resolveLatestReviewPath(input.loopDir)
  const reviewContent = readLatestReviewContent(input.loopDir)
  if (reviewPath && reviewContent) {
    fs.writeFileSync(path.join(exportDir, EXPORT_REVIEW_FILENAME), reviewContent, 'utf8')
    files.push(EXPORT_REVIEW_FILENAME)
  }

  if (
    copyIfExists(
      path.join(input.loopDir, FAILURE_DOMAINS_FILENAME),
      path.join(exportDir, EXPORT_FAILURE_DOMAINS_FILENAME),
    )
  ) {
    files.push(EXPORT_FAILURE_DOMAINS_FILENAME)
  }

  if (writeLogTail(path.join(input.loopDir, 'log.ndjson'), path.join(exportDir, EXPORT_LOG_TAIL_FILENAME))) {
    files.push(EXPORT_LOG_TAIL_FILENAME)
  }

  console.error(
    `[agent-loop] export pack: ${path.relative(input.repoRoot, exportDir)} (${files.join(', ')})`,
  )

  return { exportDir, metaPath, files }
}

/** Load export-pack review / log-tail / failure domains when in-loop files are missing. */
export function readLoopExportPackArtifacts(input: {
  repoRoot: string
  loopDir: string
}): {
  exportDir?: string
  review?: { path: string; content: string }
  logNdjson?: string
  failureDomains?: string
  runReport?: string
  meta?: LoopExportMeta
} {
  const loopRel = path.relative(input.repoRoot, input.loopDir) || '.'
  const exportDir = resolveLoopExportDir(input.repoRoot, loopRel)
  if (!fs.existsSync(exportDir)) return {}

  const out: ReturnType<typeof readLoopExportPackArtifacts> = { exportDir }

  const metaPath = path.join(exportDir, EXPORT_META_FILENAME)
  if (fs.existsSync(metaPath)) {
    try {
      out.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as LoopExportMeta
    } catch {
      // ignore corrupt meta
    }
  }

  const reviewPath = path.join(exportDir, EXPORT_REVIEW_FILENAME)
  if (fs.existsSync(reviewPath)) {
    out.review = { path: reviewPath, content: fs.readFileSync(reviewPath, 'utf8') }
  }

  const logPath = path.join(exportDir, EXPORT_LOG_TAIL_FILENAME)
  if (fs.existsSync(logPath)) {
    out.logNdjson = fs.readFileSync(logPath, 'utf8').trim()
  }

  const failurePath = path.join(exportDir, EXPORT_FAILURE_DOMAINS_FILENAME)
  if (fs.existsSync(failurePath)) {
    out.failureDomains = fs.readFileSync(failurePath, 'utf8').trim()
  }

  const reportPath = path.join(exportDir, EXPORT_RUN_REPORT_FILENAME)
  if (fs.existsSync(reportPath)) {
    out.runReport = fs.readFileSync(reportPath, 'utf8')
  }

  return out
}

import type { ParsedBlocker, ParsedReview } from './reviewVerdict.js'
import { isBlockingBlocker } from './reviewVerdict.js'

/** Match `path/to/file.ext:123` or bare repo-relative paths with a common extension. */
const FILE_LINE_RE =
  /(?:^|[\s`"'([])((?:src|scripts|templates|docs|tests?|\.cursor)\/[\w./+-]+\.[A-Za-z0-9]+)(?::(\d+))?/g

const ANY_PATH_LINE_RE =
  /(?:^|[\s`"'([])([\w./+-]+\.(?:ts|tsx|js|jsx|mjs|cjs|md|json|sh|yml|yaml))(?::(\d+))?/g

export type FileCitation = {
  path: string
  line?: number
}

export function extractFileCitations(text: string): FileCitation[] {
  const found = new Map<string, FileCitation>()
  for (const re of [FILE_LINE_RE, ANY_PATH_LINE_RE]) {
    re.lastIndex = 0
    for (const match of text.matchAll(re)) {
      const path = match[1]!.replace(/^\.\//, '')
      const lineRaw = match[2]
      const line = lineRaw ? Number(lineRaw) : undefined
      const key = `${path}:${line ?? ''}`
      if (!found.has(key)) {
        found.set(key, line && Number.isFinite(line) ? { path, line } : { path })
      }
    }
  }
  return [...found.values()]
}

export function normalizeRepoPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/')
}

export function pathIsInChangedSet(path: string, changedPaths: Iterable<string>): boolean {
  const normalized = normalizeRepoPath(path)
  for (const changed of changedPaths) {
    const c = normalizeRepoPath(changed)
    if (c === normalized || c.endsWith(`/${normalized}`) || normalized.endsWith(`/${c}`)) {
      return true
    }
  }
  return false
}

export type ReproduceFilterResult = {
  parsed: ParsedReview
  dropped: Array<{ blocker: ParsedBlocker; reason: string }>
}

function downgradeBlocker(blocker: ParsedBlocker, reason: string): ParsedBlocker {
  const raw = `severity: warning impact: none ${blocker.raw.replace(
    /^severity:\s*(error|warning)\s+impact:\s*[\w-]+\s+/i,
    '',
  )} _(downgraded: ${reason})_`
  return {
    ...blocker,
    severity: 'warning',
    impact: 'none',
    raw,
  }
}

/**
 * Deterministic reproduce-before-report filter (roadmap M2 phase 2a).
 * Downgrades error+impact blockers that lack a citeable path in the changed-files set.
 */
export function applyReproduceBeforeReportFilter(
  parsed: ParsedReview,
  changedPaths: Iterable<string>,
): ReproduceFilterResult {
  const dropped: ReproduceFilterResult['dropped'] = []
  const blockers = parsed.blockers.map((blocker) => {
    if (!isBlockingBlocker(blocker)) return blocker

    const citations = extractFileCitations(`${blocker.title} ${blocker.detail} ${blocker.raw}`)
    if (citations.length === 0) {
      const reason = 'no file:line citation'
      dropped.push({ blocker, reason })
      return downgradeBlocker(blocker, reason)
    }

    const inDiff = citations.some((c) => pathIsInChangedSet(c.path, changedPaths))
    if (!inDiff) {
      const reason = `cited path(s) outside merge-base diff (${citations.map((c) => c.path).join(', ')})`
      dropped.push({ blocker, reason })
      return downgradeBlocker(blocker, reason)
    }

    return blocker
  })

  return {
    parsed: { ...parsed, blockers },
    dropped,
  }
}

export function formatReproduceFilterFooter(
  dropped: ReproduceFilterResult['dropped'],
): string {
  if (dropped.length === 0) return ''
  const lines = dropped.map(
    (d) => `- ${d.blocker.title || d.blocker.raw.slice(0, 80)} — ${d.reason}`,
  )
  return `\n\n### Reproduce filter (deterministic)\n_Downgraded ${dropped.length} gating blocker(s):_\n${lines.join('\n')}\n`
}

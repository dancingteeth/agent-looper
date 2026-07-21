import type { ParsedBlocker, ParsedReview } from './reviewVerdict.js'
import { blockingBlockers, isBlockingBlocker } from './reviewVerdict.js'

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
 * When `changedPaths` is empty, returns the review unchanged (avoid false-closure).
 */
export function applyReproduceBeforeReportFilter(
  parsed: ParsedReview,
  changedPaths: Iterable<string>,
): ReproduceFilterResult {
  const changedList = [...changedPaths]
  if (changedList.length === 0) {
    return { parsed, dropped: [] }
  }

  const dropped: ReproduceFilterResult['dropped'] = []
  const blockers = parsed.blockers.map((blocker) => {
    if (!isBlockingBlocker(blocker)) return blocker

    const citations = extractFileCitations(`${blocker.title} ${blocker.detail} ${blocker.raw}`)
    if (citations.length === 0) {
      const reason = 'no file:line citation'
      dropped.push({ blocker, reason })
      return downgradeBlocker(blocker, reason)
    }

    const inDiff = citations.some((c) => pathIsInChangedSet(c.path, changedList))
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

export function blockerMatchKey(blocker: ParsedBlocker): string {
  const citations = extractFileCitations(`${blocker.title} ${blocker.detail} ${blocker.raw}`)
  if (citations[0]) {
    const line = citations[0].line ?? ''
    return `path:${normalizeRepoPath(citations[0].path)}:${line}`
  }
  return `title:${blocker.title.replace(/\*\*/g, '').trim().toLowerCase()}`
}

function agentKeptPrior(prior: ParsedBlocker, kept: ParsedBlocker[]): boolean {
  const priorKey = blockerMatchKey(prior)
  const priorTitle = prior.title.replace(/\*\*/g, '').trim().toLowerCase()
  return kept.some((k) => {
    if (blockerMatchKey(k) === priorKey) return true
    const keptTitle = k.title.replace(/\*\*/g, '').trim().toLowerCase()
    if (priorTitle && keptTitle && (priorTitle.includes(keptTitle) || keptTitle.includes(priorTitle))) {
      return true
    }
    return false
  })
}

/**
 * Phase 2b: downgrade prior gating blockers that the fresh reproduce agent did not KEEP.
 * `keptFromAgent` should be blocking blockers parsed from the reproduce session output.
 */
export function applyAgentReproduceKeepList(
  parsed: ParsedReview,
  keptFromAgent: ParsedBlocker[],
): ReproduceFilterResult {
  const kept = keptFromAgent.filter(isBlockingBlocker)
  const dropped: ReproduceFilterResult['dropped'] = []
  const blockers = parsed.blockers.map((blocker) => {
    if (!isBlockingBlocker(blocker)) return blocker
    if (agentKeptPrior(blocker, kept)) return blocker
    const reason = 'reproduce agent DROP (not evidenced)'
    dropped.push({ blocker, reason })
    return downgradeBlocker(blocker, reason)
  })
  return { parsed: { ...parsed, blockers }, dropped }
}

export function formatAgentReproduceFooter(
  dropped: ReproduceFilterResult['dropped'],
): string {
  if (dropped.length === 0) return ''
  const lines = dropped.map(
    (d) => `- ${d.blocker.title || d.blocker.raw.slice(0, 80)} — ${d.reason}`,
  )
  return `\n\n### Reproduce agent (fresh context)\n_Dropped ${dropped.length} gating blocker(s):_\n${lines.join('\n')}\n`
}

/** Merge key for secondary review union — impact + normalized title (M3). */
export function gatingBlockerMergeKey(blocker: ParsedBlocker): string {
  const title = blocker.title.replace(/\*\*/g, '').trim().toLowerCase()
  return `${blocker.impact}:${title}`
}

function gatingBlockersMatch(a: ParsedBlocker, b: ParsedBlocker): boolean {
  if (gatingBlockerMergeKey(a) === gatingBlockerMergeKey(b)) return true
  if (a.impact !== b.impact) return false
  const aTitle = a.title.replace(/\*\*/g, '').trim().toLowerCase()
  const bTitle = b.title.replace(/\*\*/g, '').trim().toLowerCase()
  if (!aTitle || !bTitle) return false
  return aTitle.includes(bTitle) || bTitle.includes(aTitle)
}

export type SecondaryMergeResult = {
  parsed: ParsedReview
  secondaryOnly: ParsedBlocker[]
}

/**
 * Union gating blockers from primary and secondary reviews (M3).
 * Advisory-only findings stay on each side; only error+impact blockers are merged.
 */
export function mergePrimarySecondaryReviews(
  primary: ParsedReview,
  secondary: ParsedReview,
): SecondaryMergeResult {
  const primaryGating = blockingBlockers(primary)
  const secondaryGating = blockingBlockers(secondary)
  const secondaryOnly: ParsedBlocker[] = []

  for (const candidate of secondaryGating) {
    if (!primaryGating.some((prior) => gatingBlockersMatch(prior, candidate))) {
      secondaryOnly.push(candidate)
    }
  }

  const mergedBlockers = [...primary.blockers, ...secondaryOnly]
  const mergedGating = blockingBlockers({ ...primary, blockers: mergedBlockers })
  const verdict = mergedGating.length > 0 ? 'BLOCKERS' : primary.verdict

  return {
    parsed: {
      verdict,
      risk: primary.risk,
      blockers: mergedBlockers,
    },
    secondaryOnly,
  }
}

export function formatSecondaryMergeFooter(secondaryOnly: ParsedBlocker[]): string {
  if (secondaryOnly.length === 0) return ''
  const lines = secondaryOnly.map((b) => `- ${b.title || b.raw.slice(0, 80)}`)
  return `\n\n### Secondary merge\n_Added ${secondaryOnly.length} secondary-only gating blocker(s):_\n${lines.join('\n')}\n`
}


export type ReviewVerdict = 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN'

export type ReviewRisk = 'high' | 'medium' | 'low' | 'unknown'

export type ParsedReview = {
  verdict: ReviewVerdict
  risk: ReviewRisk
  blockers: string[]
}

export const UNPARSEABLE_VERDICT_BLOCKER =
  'Could not parse review verdict — review.md must include `### Verdict` with PASS, ADVISORY, or BLOCKERS'

const SECTION_HEADING = /^###\s+(.+)\s*$/

function extractSection(text: string, heading: string): string | null {
  const lines = text.split('\n')
  const target = heading.toLowerCase()
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(SECTION_HEADING)
    if (match && match[1]!.trim().toLowerCase() === target) {
      start = i + 1
      break
    }
  }

  if (start < 0) return null

  const body: string[] = []
  for (let i = start; i < lines.length; i++) {
    const line = lines[i]!
    if (SECTION_HEADING.test(line)) break
    if (line.trim() === '---') break
    body.push(line)
  }

  return body.join('\n').trim()
}

function normalizeVerdictLine(line: string): string {
  return line
    .replace(/^>\s*/, '')
    .replace(/\*\*/g, '')
    .trim()
}

function tokenToVerdict(token: string): ReviewVerdict | null {
  if (token === 'BLOCKERS' || token.startsWith('BLOCKERS ') || token === 'BLOCKER') {
    return 'BLOCKERS'
  }
  if (token === 'ADVISORY' || token.startsWith('ADVISORY ')) return 'ADVISORY'
  if (token === 'PASS' || token.startsWith('PASS ')) return 'PASS'
  return null
}

function linesFromVerdictSection(section: string): string[] {
  const lines: string[] = []

  for (const block of section.matchAll(/```(?:[^\n]*)\n?([\s\S]*?)```/g)) {
    for (const line of block[1]!.split('\n')) {
      const normalized = normalizeVerdictLine(line)
      if (normalized) lines.push(normalized)
    }
  }

  const withoutFences = section.replace(/```[\s\S]*?```/g, '')
  for (const line of withoutFences.split('\n')) {
    const normalized = normalizeVerdictLine(line)
    if (normalized) lines.push(normalized)
  }

  return lines
}

function parseVerdictHeadline(section: string): string {
  return linesFromVerdictSection(section)[0] ?? ''
}

function parseVerdict(section: string | null): ReviewVerdict {
  if (!section) return 'UNKNOWN'
  for (const line of linesFromVerdictSection(section)) {
    const verdict = tokenToVerdict(line.toUpperCase())
    if (verdict) return verdict
  }
  return 'UNKNOWN'
}

function isEmptyBlockersDeclaration(item: string): boolean {
  const plain = item.replace(/\*\*/g, '').trim().toLowerCase()
  return (
    plain === 'none' ||
    plain.startsWith('none ') ||
    plain.startsWith('none for') ||
    /^no blockers\b/.test(plain)
  )
}

function parseRisk(section: string | null): ReviewRisk {
  if (!section) return 'unknown'
  const normalized = section.replace(/\*\*/g, '').toLowerCase()
  if (/\bhigh\b/.test(normalized)) return 'high'
  if (/\bmedium\b/.test(normalized)) return 'medium'
  if (/\blow\b/.test(normalized)) return 'low'
  return 'unknown'
}

function parseBlockers(section: string | null): string[] {
  if (!section) return []

  const blockers: string[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-')) continue
    const item = trimmed.replace(/^-\s*/, '').trim()
    if (!item || isEmptyBlockersDeclaration(item)) continue
    blockers.push(item)
  }
  return blockers
}

export function parseReviewMarkdown(text: string): ParsedReview {
  const riskSection = extractSection(text, 'Risk')
  const verdictSection = extractSection(text, 'Verdict')
  const blockersSection = extractSection(text, 'Blockers')

  return {
    verdict: parseVerdict(verdictSection),
    risk: parseRisk(riskSection),
    blockers: parseBlockers(blockersSection),
  }
}

export type ReviewVerdictCompletionOptions = {
  /** When true, UNKNOWN verdicts block loop completion (fail-closed). */
  reviewGate?: boolean
}

export function reviewVerdictAllowsCompletion(
  verdict: ReviewVerdict,
  options: ReviewVerdictCompletionOptions = {},
): boolean {
  if (options.reviewGate) {
    return verdict === 'PASS' || verdict === 'ADVISORY'
  }
  return verdict === 'PASS' || verdict === 'ADVISORY' || verdict === 'UNKNOWN'
}

export function reviewGateBlockers(parsed: ParsedReview): string[] {
  if (parsed.verdict === 'BLOCKERS') return parsed.blockers
  if (parsed.verdict === 'UNKNOWN') return [UNPARSEABLE_VERDICT_BLOCKER]
  return []
}

export function reviewGateBlocksCompletion(parsed: ParsedReview): boolean {
  return parsed.verdict === 'BLOCKERS' || parsed.verdict === 'UNKNOWN'
}

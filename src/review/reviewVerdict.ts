export type ReviewVerdict = 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN'

export type ReviewRisk = 'high' | 'medium' | 'low' | 'unknown'

export type BlockerSeverity = 'error' | 'warning'

/** Recognized impact tags that can gate reviewGate when severity is error. */
export const BLOCKER_IMPACT_TAGS = [
  'data-loss',
  'security-boundary',
  'false-closure',
  'cross-dispatch',
  'verify-bypass',
] as const

export type BlockerImpactTag = (typeof BLOCKER_IMPACT_TAGS)[number]

export type BlockerImpact = BlockerImpactTag | 'none'

export type ParsedBlocker = {
  severity: BlockerSeverity
  impact: BlockerImpact
  title: string
  detail: string
  /** Original bullet text from review.md */
  raw: string
}

export type ParsedReview = {
  verdict: ReviewVerdict
  risk: ReviewRisk
  blockers: ParsedBlocker[]
}

export const UNPARSEABLE_VERDICT_BLOCKER =
  'Could not parse review verdict — review.md must include `### Verdict` with PASS, ADVISORY, or BLOCKERS'

const SECTION_HEADING = /^###\s+(.+)\s*$/

const STRUCTURED_BLOCKER_PREFIX =
  /^severity:\s*(error|warning)\s+impact:\s*([\w-]+)\s+/i

function headingMatches(found: string, target: string): boolean {
  const heading = found.trim().toLowerCase()
  const want = target.trim().toLowerCase()
  return heading === want || heading.startsWith(`${want} `) || heading.startsWith(`${want}(`)
}

function extractSection(text: string, heading: string): string | null {
  const lines = text.split('\n')
  let start = -1

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i]!.match(SECTION_HEADING)
    if (match && headingMatches(match[1]!, heading)) {
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

function parseVerdict(section: string | null): ReviewVerdict {
  if (!section) return 'UNKNOWN'
  for (const line of linesFromVerdictSection(section)) {
    const verdict = tokenToVerdict(line.toUpperCase())
    if (verdict) return verdict
  }
  return 'UNKNOWN'
}

const VERDICT_HEADING_PREFIX =
  /^verdict(?:\s*\(\s*PASS\s*\|\s*ADVISORY\s*\|\s*BLOCKERS\s*\))?/i

/**
 * `### Verdict — ADVISORY` / `### Verdict: PASS`. extractSection treats the
 * whole line as the Verdict heading, then parseVerdict reads the *body* and
 * misses the token. Do not treat `### Verdict (PASS | ADVISORY | BLOCKERS)`
 * as PASS — that is the enum hint, not a verdict.
 */
function parseVerdictFromHeadings(text: string): ReviewVerdict {
  for (const line of text.split('\n')) {
    const match = line.match(SECTION_HEADING)
    if (!match) continue
    const heading = match[1]!.replace(/\*\*/g, '').trim()
    const rest = heading.replace(VERDICT_HEADING_PREFIX, '').trim()
    if (rest === heading.trim() || !rest) continue
    const token = rest.replace(/^[—–\-:|()\s]+/, '').trim().split(/\s+/)[0]
    if (!token) continue
    const verdict = tokenToVerdict(token.toUpperCase())
    if (verdict) return verdict
  }
  return 'UNKNOWN'
}

function parseRiskFromHeadings(text: string): ReviewRisk {
  for (const line of text.split('\n')) {
    const match = line.match(SECTION_HEADING)
    if (!match) continue
    const heading = match[1]!.replace(/\*\*/g, '').trim()
    if (!/^risk\b/i.test(heading)) continue
    const rest = heading.replace(/^risk\b/i, '').replace(/^[—–\-:|\s]+/, '').toLowerCase()
    if (/\bhigh\b/.test(rest)) return 'high'
    if (/\bmedium\b/.test(rest)) return 'medium'
    if (/\blow\b/.test(rest)) return 'low'
  }
  return 'unknown'
}

/**
 * Compact reminder row some judges copy literally:
 * `### Risk | … | ### Verdict (PASS | ADVISORY | BLOCKERS) | …`
 * That line is not a `### Verdict` heading, so extractSection misses it.
 * Take the next pipe row and read a short PASS/ADVISORY/BLOCKERS cell.
 */
function parseCompactTableVerdict(text: string): ReviewVerdict {
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const header = lines[i]!
    if (!header.includes('|') || !/###\s*Verdict/i.test(header)) continue
    for (let j = i + 1; j < lines.length; j++) {
      const row = lines[j]!.trim()
      if (!row) continue
      if (!row.includes('|')) return 'UNKNOWN'
      for (const cell of row.split('|')) {
        const normalized = normalizeVerdictLine(cell)
        if (!normalized || normalized.length > 24) continue
        const verdict = tokenToVerdict(normalized.toUpperCase())
        if (verdict) return verdict
      }
      return 'UNKNOWN'
    }
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

function isKnownImpactTag(value: string): value is BlockerImpactTag {
  return (BLOCKER_IMPACT_TAGS as readonly string[]).includes(value)
}

function splitTitleDetail(body: string): { title: string; detail: string } {
  const emDash = body.indexOf(' — ')
  if (emDash >= 0) {
    return {
      title: body.slice(0, emDash).trim(),
      detail: body.slice(emDash + 3).trim(),
    }
  }
  return { title: body.trim(), detail: '' }
}

export function parseBlockerItem(item: string): ParsedBlocker {
  const raw = item.trim()
  const structured = raw.match(STRUCTURED_BLOCKER_PREFIX)
  if (structured) {
    const severity = structured[1]!.toLowerCase() as BlockerSeverity
    const impactToken = structured[2]!.toLowerCase()
    const impact: BlockerImpact = isKnownImpactTag(impactToken) ? impactToken : 'none'
    const remainder = raw.slice(structured[0].length).trim()
    const { title, detail } = splitTitleDetail(remainder)
    return { severity, impact, title, detail, raw }
  }

  const { title, detail } = splitTitleDetail(raw)
  return {
    severity: 'warning',
    impact: 'none',
    title,
    detail,
    raw,
  }
}

export function formatBlockerLine(blocker: ParsedBlocker): string {
  if (STRUCTURED_BLOCKER_PREFIX.test(blocker.raw)) {
    return blocker.raw
  }
  return `severity: ${blocker.severity} impact: ${blocker.impact} ${blocker.raw}`
}

export function isBlockingBlocker(blocker: ParsedBlocker): boolean {
  return blocker.severity === 'error' && isKnownImpactTag(blocker.impact)
}

export function blockingBlockers(parsed: ParsedReview): ParsedBlocker[] {
  return parsed.blockers.filter(isBlockingBlocker)
}

export function warningBlockers(parsed: ParsedReview): ParsedBlocker[] {
  return parsed.blockers.filter((b) => !isBlockingBlocker(b))
}

function parseBlockers(section: string | null): ParsedBlocker[] {
  if (!section) return []

  const blockers: ParsedBlocker[] = []
  for (const line of section.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-')) continue
    const item = trimmed.replace(/^-\s*/, '').trim()
    if (!item || isEmptyBlockersDeclaration(item)) continue
    blockers.push(parseBlockerItem(item))
  }
  return blockers
}

/**
 * Overlay lock: gating ### Blockers ⇒ BLOCKERS. Heading vs body disagreement
 * with no gating bullets ⇒ UNKNOWN (fail closed). Else one known token, heading
 * first so `### Verdict — ADVISORY` with a prose body still parses.
 */
function reconcileReviewVerdict(input: {
  fromHeading: ReviewVerdict
  fromBody: ReviewVerdict
  fromTable: ReviewVerdict
  blockers: ParsedBlocker[]
}): ReviewVerdict {
  if (input.blockers.some(isBlockingBlocker)) return 'BLOCKERS'

  const headingKnown = input.fromHeading !== 'UNKNOWN'
  const bodyKnown = input.fromBody !== 'UNKNOWN'
  if (headingKnown && bodyKnown && input.fromHeading !== input.fromBody) {
    return 'UNKNOWN'
  }
  if (headingKnown) return input.fromHeading
  if (bodyKnown) return input.fromBody
  return input.fromTable
}

export function parseReviewMarkdown(text: string): ParsedReview {
  const riskSection = extractSection(text, 'Risk')
  const verdictSection = extractSection(text, 'Verdict')
  const blockersSection = extractSection(text, 'Blockers')
  const fromHeading = parseVerdictFromHeadings(text)
  const fromBody = parseVerdict(verdictSection)
  const fromTable = parseCompactTableVerdict(text)
  const fromRiskHeading = parseRiskFromHeadings(text)
  const fromRiskBody = parseRisk(riskSection)
  const blockers = parseBlockers(blockersSection)

  return {
    verdict: reconcileReviewVerdict({ fromHeading, fromBody, fromTable, blockers }),
    risk: fromRiskHeading !== 'unknown' ? fromRiskHeading : fromRiskBody,
    blockers,
  }
}

export type ReviewVerdictCompletionOptions = {
  /** When true, UNKNOWN verdicts block loop completion (fail-closed). */
  reviewGate?: boolean
}

export function reviewGateBlocksCompletion(parsed: ParsedReview): boolean {
  if (blockingBlockers(parsed).length > 0) return true
  return parsed.verdict === 'UNKNOWN'
}

export function reviewVerdictAllowsCompletion(
  parsed: ParsedReview,
  options: ReviewVerdictCompletionOptions = {},
): boolean {
  // Advisory review (reviewGate off) never blocks loop completion — even a
  // BLOCKERS verdict surfaces as `reviewAdvisoryBlockers` on the result.
  if (!options.reviewGate) return true
  return !reviewGateBlocksCompletion(parsed)
}

export function reviewGateBlockers(parsed: ParsedReview): string[] {
  if (parsed.verdict === 'UNKNOWN') return [UNPARSEABLE_VERDICT_BLOCKER]
  return blockingBlockers(parsed).map(formatBlockerLine)
}

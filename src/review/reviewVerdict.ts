export type ReviewVerdict = 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN'

export type ReviewRisk = 'high' | 'medium' | 'low' | 'unknown'

export type ParsedReview = {
  verdict: ReviewVerdict
  risk: ReviewRisk
  blockers: string[]
}

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

function parseVerdictHeadline(section: string): string {
  return section.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
}

function parseVerdict(section: string | null): ReviewVerdict {
  if (!section) return 'UNKNOWN'
  const headline = parseVerdictHeadline(section)
  const token = headline.replace(/\*\*/g, '').trim().toUpperCase()
  if (token === 'BLOCKERS' || token.startsWith('BLOCKERS ')) return 'BLOCKERS'
  if (token === 'ADVISORY' || token.startsWith('ADVISORY ')) return 'ADVISORY'
  if (token === 'PASS' || token.startsWith('PASS ')) return 'PASS'
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

export function reviewVerdictAllowsCompletion(verdict: ReviewVerdict): boolean {
  return verdict === 'PASS' || verdict === 'ADVISORY' || verdict === 'UNKNOWN'
}

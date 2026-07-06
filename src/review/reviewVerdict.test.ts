import { describe, expect, it } from 'vitest'
import {
  parseReviewMarkdown,
  reviewGateBlockers,
  reviewGateBlocksCompletion,
  reviewVerdictAllowsCompletion,
  UNPARSEABLE_VERDICT_BLOCKER,
} from './reviewVerdict.js'

describe('parseReviewMarkdown', () => {
  it('parses PASS verdict with low risk', () => {
    const parsed = parseReviewMarkdown(`### Risk
**LOW** — docs only

### Verdict
**PASS**

### Blockers
`)
    expect(parsed.verdict).toBe('PASS')
    expect(parsed.risk).toBe('low')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed.verdict, { reviewGate: true })).toBe(true)
  })

  it('parses ADVISORY verdict', () => {
    const parsed = parseReviewMarkdown(`### Risk
**MEDIUM**

### Verdict
**ADVISORY**

### Blockers
`)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(reviewVerdictAllowsCompletion(parsed.verdict, { reviewGate: true })).toBe(true)
  })

  it('parses BLOCKERS with blocker list items', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKERS**

### Blockers
- [must-fix] **Unit guard** — verify doc.unit before PATCH
- [must-fix] **Docs missing** — README still template

### Advisory
- [should-fix] dedupe helper
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers).toHaveLength(2)
    expect(parsed.blockers[0]).toContain('Unit guard')
    expect(reviewVerdictAllowsCompletion(parsed.verdict, { reviewGate: true })).toBe(false)
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
  })

  it('returns UNKNOWN for malformed review and blocks when reviewGate is on', () => {
    const parsed = parseReviewMarkdown('No structured sections here.')
    expect(parsed.verdict).toBe('UNKNOWN')
    expect(parsed.risk).toBe('unknown')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed.verdict, { reviewGate: true })).toBe(false)
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
    expect(reviewGateBlockers(parsed)).toEqual([UNPARSEABLE_VERDICT_BLOCKER])
  })

  it('parses ADVISORY when verdict prose mentions blockers (unified-code-review shape)', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**ADVISORY**

Loop-scoped implementation satisfies the write-guard blockers from the prior review.

### Blockers
- none for **loop-scoped code** (verifier green)
`)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed.verdict, { reviewGate: true })).toBe(true)
  })

  it('parses BLOCKERS inside a fenced verdict section', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
\`\`\`
BLOCKERS
\`\`\`

### Blockers
- [must-fix] fenced verdict
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
  })

  it('parses BLOCKERS from a blockquoted verdict line', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
> BLOCKERS

### Blockers
- [must-fix] quoted verdict
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('parses singular BLOCKER headline as BLOCKERS', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKER**

### Blockers
- [must-fix] singular label
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('parses BLOCKERS after a blank line under the verdict heading', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict

BLOCKERS

### Blockers
- [must-fix] blank line before verdict token
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('parses a high-risk BLOCKERS fixture with multiple blocker bullets', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH** — admin write guards

### Verdict
**BLOCKERS**

### Blockers
- [must-fix] **§2.4 task traceability** — GOAL UUID missing from commits
- [must-fix] **App-layer unit guard** — verify doc.unit before PATCH
- [must-fix] **Docs missing** — README still template
- [must-fix] **Route coverage** — add regression test for PATCH handler
- [must-fix] **Error shape** — align API errors with existing payload pattern
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers.length).toBeGreaterThanOrEqual(5)
    expect(parsed.blockers.some((b) => b.includes('§2.4 task traceability'))).toBe(true)
    expect(parsed.blockers.some((b) => b.includes('App-layer unit guard'))).toBe(true)
  })
})

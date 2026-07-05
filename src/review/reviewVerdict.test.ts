import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  parseReviewMarkdown,
  reviewVerdictAllowsCompletion,
} from './reviewVerdict.js'

const KINOLAB_REVIEW_PATH = path.resolve(
  '/Users/paulzgordan/Projects/multi-store/payload-ecommerce/.cursor/loops/kinolab-skybridge-admin/review.md',
)

const KINOLAB_WRITE_GUARDS_REVIEW_PATH = path.resolve(
  '/Users/paulzgordan/Projects/multi-store/payload-ecommerce/.cursor/loops/kinolab-skybridge-write-guards/review.2.md',
)

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
  })

  it('parses ADVISORY verdict', () => {
    const parsed = parseReviewMarkdown(`### Risk
**MEDIUM**

### Verdict
**ADVISORY**

### Blockers
`)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
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
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(false)
  })

  it('returns UNKNOWN for malformed review', () => {
    const parsed = parseReviewMarkdown('No structured sections here.')
    expect(parsed.verdict).toBe('UNKNOWN')
    expect(parsed.risk).toBe('unknown')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
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
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
  })

  it('parses unified-code-review ADVISORY with prose mentioning blockers (write-guards)', () => {
    if (!fs.existsSync(KINOLAB_WRITE_GUARDS_REVIEW_PATH)) {
      return
    }
    const text = fs.readFileSync(KINOLAB_WRITE_GUARDS_REVIEW_PATH, 'utf8')
    const parsed = parseReviewMarkdown(text)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed.verdict)).toBe(true)
  })

  it('parses the real Kinolab Skybridge admin review fixture', () => {
    if (!fs.existsSync(KINOLAB_REVIEW_PATH)) {
      return
    }
    const text = fs.readFileSync(KINOLAB_REVIEW_PATH, 'utf8')
    const parsed = parseReviewMarkdown(text)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers.length).toBeGreaterThanOrEqual(5)
    expect(parsed.blockers.some((b) => b.includes('§2.4 task traceability'))).toBe(true)
    expect(parsed.blockers.some((b) => b.includes('App-layer unit guard'))).toBe(true)
  })
})

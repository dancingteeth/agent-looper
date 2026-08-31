import { describe, expect, it } from 'vitest'
import {
  blockingBlockers,
  formatBlockerLine,
  isBlockingBlocker,
  parseBlockerItem,
  parseReviewMarkdown,
  reviewGateBlockers,
  reviewGateBlocksCompletion,
  reviewVerdictAllowsCompletion,
  UNPARSEABLE_VERDICT_BLOCKER,
  warningBlockers,
} from './reviewVerdict.js'

describe('parseBlockerItem', () => {
  it('parses structured severity and impact', () => {
    const blocker = parseBlockerItem(
      'severity: error impact: false-closure [must-fix] **Docs missing** — README still template',
    )
    expect(blocker.severity).toBe('error')
    expect(blocker.impact).toBe('false-closure')
    expect(blocker.title).toContain('Docs missing')
    expect(isBlockingBlocker(blocker)).toBe(true)
  })

  it('defaults legacy bullets to warning / none impact', () => {
    const blocker = parseBlockerItem('[must-fix] **Unit guard** — verify doc.unit before PATCH')
    expect(blocker.severity).toBe('warning')
    expect(blocker.impact).toBe('none')
    expect(isBlockingBlocker(blocker)).toBe(false)
  })

  it('treats error with unknown impact as non-gating', () => {
    const blocker = parseBlockerItem('severity: error impact: cosmetic [must-fix] **Tone** — wording')
    expect(blocker.severity).toBe('error')
    expect(blocker.impact).toBe('none')
    expect(isBlockingBlocker(blocker)).toBe(false)
  })
})

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
    expect(reviewVerdictAllowsCompletion(parsed)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
  })

  it('parses ADVISORY when the verdict heading includes the enum hint', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict (PASS | ADVISORY | BLOCKERS)
**ADVISORY** — intervention mode **Proceed**. Verifier is green.

### Blockers
None.
`)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
  })

  it('parses BLOCKERS with gating and warning items', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKERS**

### Blockers
- severity: error impact: verify-bypass [must-fix] **Unit guard** — verify doc.unit before PATCH
- severity: warning impact: none [should-fix] **Docs tone** — intro wording

### Advisory
- [should-fix] dedupe helper
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers).toHaveLength(2)
    expect(blockingBlockers(parsed)).toHaveLength(1)
    expect(parsed.blockers[0]!.title).toContain('Unit guard')
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(false)
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
    expect(reviewGateBlockers(parsed)).toHaveLength(1)
    expect(reviewGateBlockers(parsed)[0]).toContain('severity: error')
  })

  it('allows completion when BLOCKERS verdict has only legacy/warning items', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKERS**

### Blockers
- [must-fix] **Docs tone** — prefer active voice
- severity: warning impact: none [should-fix] **Nit** — rename helper
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(blockingBlockers(parsed)).toHaveLength(0)
    expect(reviewGateBlocksCompletion(parsed)).toBe(false)
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
    expect(reviewGateBlockers(parsed)).toEqual([])
  })

  it('returns UNKNOWN for malformed review and blocks when reviewGate is on', () => {
    const parsed = parseReviewMarkdown('No structured sections here.')
    expect(parsed.verdict).toBe('UNKNOWN')
    expect(parsed.risk).toBe('unknown')
    expect(parsed.blockers).toEqual([])
    expect(reviewVerdictAllowsCompletion(parsed)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(false)
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
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
  })

  it('parses BLOCKERS inside a fenced verdict section', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
\`\`\`
BLOCKERS
\`\`\`

### Blockers
- severity: error impact: security-boundary [must-fix] fenced verdict
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
- severity: error impact: data-loss [must-fix] quoted verdict
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
  })

  it('parses ADVISORY from ### Verdict — ADVISORY (token on the heading)', () => {
    const parsed = parseReviewMarkdown(`# Post-loop quality review

### Risk — LOW

Documentation-only restyle.

### Verdict — ADVISORY

No gating blockers. Green verify + shell gate is the hard gate here, and it passes.

### Advisory
- severity: warning impact: none [should-fix] **Nit** — chip text
`)
    expect(parsed.verdict).toBe('ADVISORY')
    expect(parsed.risk).toBe('low')
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
  })

  it('parses PASS from ### Verdict: PASS and ### Verdict ADVISORY', () => {
    expect(
      parseReviewMarkdown(`### Verdict: PASS

Shipped.
`).verdict,
    ).toBe('PASS')
    expect(
      parseReviewMarkdown(`### Verdict ADVISORY

Nits only.
`).verdict,
    ).toBe('ADVISORY')
  })

  it('does not treat the enum-hint heading as PASS', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict (PASS | ADVISORY | BLOCKERS)
**BLOCKERS**

### Blockers
- severity: error impact: verify-bypass [must-fix] **Guard** — missing
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('parses PASS from a compact pipe-row reminder copy', () => {
    const parsed = parseReviewMarkdown(`# Post-loop quality review

### Risk | ### What could go wrong? | ### Review depth | ### Verdict (PASS | ADVISORY | BLOCKERS) | ### Blockers | ### Advisory | optional Code judo / Nits
LOW (static site CSS / docs) | Additive CSS using tokens. | Skim — 3 rule blocks. | PASS | — | — | Nit: logo size duplicates img attrs.

**Verification:** verify.sh exit 0.
`)
    expect(parsed.verdict).toBe('PASS')
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(true)
  })

  it('does not treat the compact header enum as the verdict', () => {
    const parsed = parseReviewMarkdown(`### Risk | ### Verdict (PASS | ADVISORY | BLOCKERS)
MEDIUM — auth | BLOCKERS
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('parses singular BLOCKER headline as BLOCKERS', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKER**

### Blockers
- severity: error impact: cross-dispatch [must-fix] singular label
`)
    expect(parsed.verdict).toBe('BLOCKERS')
  })

  it('formats legacy blockers with severity prefix for prompts', () => {
    const legacy = parseBlockerItem('[must-fix] legacy line')
    expect(formatBlockerLine(legacy)).toContain('severity: warning impact: none')
  })

  it('parses a high-risk BLOCKERS fixture with multiple blocker bullets', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH** — admin write guards

### Verdict
**BLOCKERS**

### Blockers
- severity: error impact: false-closure [must-fix] **§2.4 task traceability** — GOAL UUID missing from commits
- severity: error impact: verify-bypass [must-fix] **App-layer unit guard** — verify doc.unit before PATCH
- severity: warning impact: none [must-fix] **Docs missing** — README still template
- severity: error impact: verify-bypass [must-fix] **Route coverage** — add regression test for PATCH handler
- severity: error impact: security-boundary [must-fix] **Error shape** — align API errors with existing payload pattern
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(parsed.risk).toBe('high')
    expect(parsed.blockers.length).toBeGreaterThanOrEqual(5)
    expect(blockingBlockers(parsed).length).toBe(4)
    expect(warningBlockers(parsed).some((b) => b.title.includes('Docs missing'))).toBe(true)
    expect(parsed.blockers.some((b) => b.title.includes('§2.4 task traceability'))).toBe(true)
    expect(parsed.blockers.some((b) => b.title.includes('App-layer unit guard'))).toBe(true)
  })

  it('keeps BLOCKERS when a later ### Verdict — PASS heading follows a tokenless Verdict body', () => {
    const parsed = parseReviewMarkdown(`### Risk
**HIGH**

### Verdict
**BLOCKERS**

### Blockers
- severity: error impact: false-closure [must-fix] **Heading spoof** — src/review/reviewVerdict.ts:283

### Advisory
Prior review said:

### Verdict — PASS
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(blockingBlockers(parsed)).toHaveLength(1)
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(false)
  })

  it('fails closed when heading and body tokens disagree and there are no gating bullets', () => {
    const parsed = parseReviewMarkdown(`### Verdict
**BLOCKERS**

### Blockers
- none

### Quoted
### Verdict — PASS
`)
    expect(parsed.verdict).toBe('UNKNOWN')
    expect(blockingBlockers(parsed)).toHaveLength(0)
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
    expect(reviewVerdictAllowsCompletion(parsed, { reviewGate: true })).toBe(false)
  })

  it('treats gating bullets as BLOCKERS even when the heading token is PASS', () => {
    const parsed = parseReviewMarkdown(`### Verdict — PASS

Looks shipped.

### Blockers
- severity: error impact: verify-bypass [must-fix] **Guard** — src/cli/run.ts:1
`)
    expect(parsed.verdict).toBe('BLOCKERS')
    expect(reviewGateBlocksCompletion(parsed)).toBe(true)
  })
})

describe('reviewGateBlocksCompletion', () => {
  it('blocks a PASS verdict object that still carries gating bullets', () => {
    const blocker = parseBlockerItem(
      'severity: error impact: false-closure [must-fix] **Docs** — README missing',
    )
    expect(
      reviewGateBlocksCompletion({
        verdict: 'PASS',
        risk: 'high',
        blockers: [blocker],
      }),
    ).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  applyReproduceBeforeReportFilter,
  extractFileCitations,
  pathIsInChangedSet,
} from './reviewReproduce.js'
import { parseBlockerItem, type ParsedReview } from './reviewVerdict.js'

describe('extractFileCitations', () => {
  it('extracts file:line citations', () => {
    const cites = extractFileCitations('see src/review/reviewVerdict.ts:42 for parse')
    expect(cites).toEqual([{ path: 'src/review/reviewVerdict.ts', line: 42 }])
  })

  it('extracts bare paths with extensions', () => {
    const cites = extractFileCitations('broken in `src/loop/agentLoop.ts`')
    expect(cites.some((c) => c.path === 'src/loop/agentLoop.ts')).toBe(true)
  })
})

describe('pathIsInChangedSet', () => {
  it('matches exact and suffix paths', () => {
    expect(pathIsInChangedSet('src/a.ts', ['src/a.ts', 'src/b.ts'])).toBe(true)
    expect(pathIsInChangedSet('a.ts', ['src/a.ts'])).toBe(true)
    expect(pathIsInChangedSet('src/c.ts', ['src/a.ts'])).toBe(false)
  })
})

describe('applyReproduceBeforeReportFilter', () => {
  function review(blockers: string[]): ParsedReview {
    return {
      verdict: 'BLOCKERS',
      risk: 'high',
      blockers: blockers.map(parseBlockerItem),
    }
  }

  it('downgrades gating blockers without citations', () => {
    const result = applyReproduceBeforeReportFilter(
      review([
        'severity: error impact: false-closure [must-fix] **Docs missing** — README still template',
      ]),
      ['src/review/reviewVerdict.ts'],
    )
    expect(result.dropped).toHaveLength(1)
    expect(result.parsed.blockers[0]!.severity).toBe('warning')
    expect(result.parsed.blockers[0]!.impact).toBe('none')
  })

  it('keeps gating blockers citing a changed path', () => {
    const result = applyReproduceBeforeReportFilter(
      review([
        'severity: error impact: verify-bypass [must-fix] **Guard** — src/review/reviewVerdict.ts:10 missing check',
      ]),
      ['src/review/reviewVerdict.ts'],
    )
    expect(result.dropped).toHaveLength(0)
    expect(result.parsed.blockers[0]!.severity).toBe('error')
  })

  it('downgrades blockers citing paths outside the diff', () => {
    const result = applyReproduceBeforeReportFilter(
      review([
        'severity: error impact: data-loss [must-fix] **Leak** — src/unrelated/foo.ts:3',
      ]),
      ['src/review/reviewVerdict.ts'],
    )
    expect(result.dropped).toHaveLength(1)
    expect(result.parsed.blockers[0]!.severity).toBe('warning')
  })

  it('leaves warning blockers untouched', () => {
    const result = applyReproduceBeforeReportFilter(
      review(['severity: warning impact: none [should-fix] **Tone** — wording']),
      [],
    )
    expect(result.dropped).toHaveLength(0)
    expect(result.parsed.blockers[0]!.severity).toBe('warning')
  })
})

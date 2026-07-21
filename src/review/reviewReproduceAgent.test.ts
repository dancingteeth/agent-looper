import { describe, expect, it } from 'vitest'
import {
  applyAgentReproduceKeepList,
  blockerMatchKey,
  formatAgentReproduceFooter,
} from './reviewReproduce.js'
import { parseBlockerItem, type ParsedReview } from './reviewVerdict.js'

function review(blockers: string[]): ParsedReview {
  return {
    verdict: 'BLOCKERS',
    risk: 'high',
    blockers: blockers.map(parseBlockerItem),
  }
}

describe('applyAgentReproduceKeepList', () => {
  it('keeps blockers the agent re-listed and drops the rest', () => {
    const parsed = review([
      'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10',
      'severity: error impact: verify-bypass [must-fix] **Ghost** — src/review/reviewVerdict.ts:1 imaginary',
    ])
    const kept = [
      parseBlockerItem(
        'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10 still missing',
      ),
    ]
    const result = applyAgentReproduceKeepList(parsed, kept)
    expect(result.dropped).toHaveLength(1)
    expect(result.dropped[0]!.blocker.title).toContain('Ghost')
    expect(result.parsed.blockers[0]!.severity).toBe('error')
    expect(result.parsed.blockers[1]!.severity).toBe('warning')
  })

  it('drops all gating blockers when agent keeps none', () => {
    const parsed = review([
      'severity: error impact: data-loss [must-fix] **Leak** — src/a.ts:1',
    ])
    const result = applyAgentReproduceKeepList(parsed, [])
    expect(result.dropped).toHaveLength(1)
    expect(result.parsed.blockers[0]!.severity).toBe('warning')
  })
})

describe('blockerMatchKey', () => {
  it('prefers path:line keys', () => {
    const blocker = parseBlockerItem(
      'severity: error impact: false-closure [must-fix] **X** — see src/loop/agentLoop.ts:42',
    )
    expect(blockerMatchKey(blocker)).toBe('path:src/loop/agentLoop.ts:42')
  })
})

describe('formatAgentReproduceFooter', () => {
  it('notes how many candidates the agent dropped', () => {
    const parsed = review([
      'severity: error impact: false-closure [must-fix] **Ghost** — src/a.ts:1',
    ])
    const { dropped } = applyAgentReproduceKeepList(parsed, [])
    const footer = formatAgentReproduceFooter(dropped)
    expect(footer).toContain('### Reproduce agent (fresh context)')
    expect(footer).toContain('Dropped 1 gating blocker(s)')
  })
})

import { describe, expect, it } from 'vitest'
import {
  formatGuidePacketsForPrompt,
  guidePacketFromBlocker,
  guidePacketsFromReview,
} from './guidePackets.js'
import { parseBlockerItem, type ParsedReview } from './reviewVerdict.js'

describe('guidePackets', () => {
  it('builds reason + requiredChange from a structured blocker', () => {
    const blocker = parseBlockerItem(
      'severity: error impact: false-closure [must-fix] **Docs missing** — README still template',
    )
    const packet = guidePacketFromBlocker(blocker)
    expect(packet.reason).toContain('Docs missing')
    expect(packet.reason).toContain('false-closure')
    expect(packet.requiredChange).toBe('README still template')
    expect(packet.raw).toContain('severity: error')
  })

  it('extracts gating packets from a BLOCKERS review', () => {
    const parsed: ParsedReview = {
      verdict: 'BLOCKERS',
      risk: 'medium',
      blockers: [
        parseBlockerItem(
          'severity: error impact: data-loss **Wipe** — Dropping table without backup',
        ),
        parseBlockerItem('severity: warning impact: none **Nit** — Rename variable'),
      ],
    }
    const packets = guidePacketsFromReview(parsed)
    expect(packets).toHaveLength(1)
    expect(packets[0]!.impact).toBe('data-loss')
    expect(formatGuidePacketsForPrompt(packets)).toContain('**Guide**')
    expect(formatGuidePacketsForPrompt(packets)).toContain('Required change:')
  })

  it('returns a packet for UNKNOWN verdict', () => {
    const packets = guidePacketsFromReview({
      verdict: 'UNKNOWN',
      risk: 'unknown',
      blockers: [],
    })
    expect(packets).toHaveLength(1)
    expect(packets[0]!.impact).toBe('false-closure')
  })
})

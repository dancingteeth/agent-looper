import {
  blockingBlockers,
  formatBlockerLine,
  UNPARSEABLE_VERDICT_BLOCKER,
  type BlockerImpact,
  type BlockerSeverity,
  type ParsedBlocker,
  type ParsedReview,
} from './reviewVerdict.js'

/**
 * Structured feedback for the next worker iteration after reviewGate continues.
 * Maps to Strands-style Guide: cancel/retry with a concrete required change.
 */
export type GuidePacket = {
  reason: string
  requiredChange: string
  impact: BlockerImpact
  severity: BlockerSeverity
  /** Flattened line kept for blocker-recheck / HITL compatibility. */
  raw: string
}

export function guidePacketFromBlocker(blocker: ParsedBlocker): GuidePacket {
  const title = blocker.title.trim() || blocker.raw.trim()
  const detail = blocker.detail.trim()
  const reason =
    blocker.impact !== 'none' ? `${title} (impact: ${blocker.impact})` : title
  const requiredChange = detail || `Fix gating blocker: ${title}`
  return {
    reason,
    requiredChange,
    impact: blocker.impact,
    severity: blocker.severity,
    raw: formatBlockerLine(blocker),
  }
}

export function guidePacketsFromReview(parsed: ParsedReview): GuidePacket[] {
  if (parsed.verdict === 'UNKNOWN') {
    return [
      {
        reason: 'Unparseable review verdict',
        requiredChange: UNPARSEABLE_VERDICT_BLOCKER,
        impact: 'false-closure',
        severity: 'error',
        raw: UNPARSEABLE_VERDICT_BLOCKER,
      },
    ]
  }
  return blockingBlockers(parsed).map(guidePacketFromBlocker)
}

export function formatGuidePacketsForPrompt(packets: GuidePacket[]): string {
  return packets
    .map(
      (packet, i) =>
        `${i + 1}. **Guide** — ${packet.reason}\n   Required change: ${packet.requiredChange}`,
    )
    .join('\n')
}

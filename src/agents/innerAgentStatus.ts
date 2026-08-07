export const CLINE_INNER_MAX_ITERATIONS = 25

const CLINE_INNER_CAP_MESSAGE_RE = /^Agent runtime exceeded maxIterations \((\d+)\)\.?$/i

export type InnerAgentSource = 'cline' | 'cursor' | 'opencode'

export type InnerAgentStatus = {
  complete: boolean
  reason?: string
  /** Inner Cline session iteration cap (distinct from outer loop maxIterations). */
  clineMaxIterations?: number
}

export function resolveInnerAgentStatus(
  text: string,
  source: InnerAgentSource = 'cline',
): InnerAgentStatus {
  const trimmed = text.trim()
  const match = trimmed.match(CLINE_INNER_CAP_MESSAGE_RE)
  if (match) {
    const cap = Number(match[1])
    return {
      complete: false,
      reason: `Inner Cline agent exceeded clineMaxIterations (${cap})`,
      clineMaxIterations: cap,
    }
  }

  if (!trimmed && source === 'cline') {
    return { complete: false, reason: 'Inner Cline agent returned empty output' }
  }

  return { complete: true }
}

const PREVIEW_MAX = 500

export function previewAssistantText(text: string, innerAgent?: InnerAgentStatus): string {
  const trimmed = text.trim()
  if (innerAgent && !innerAgent.complete && CLINE_INNER_CAP_MESSAGE_RE.test(trimmed)) {
    const cap = innerAgent.clineMaxIterations ?? CLINE_INNER_MAX_ITERATIONS
    return `(inner agent reached clineMaxIterations=${cap}; outer loop may still pass verifier)`
  }
  if (trimmed.length <= PREVIEW_MAX) return trimmed
  return `${trimmed.slice(0, PREVIEW_MAX)}…`
}

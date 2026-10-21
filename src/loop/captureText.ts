/** Max bytes kept in memory for verify/setup shell capture before sidecar write. */
export const VERIFY_CAPTURE_MAX = 64 * 1024

export const CAPTURE_ELISION_MARKER = '\n…(truncated middle)…\n'

/**
 * Keep both ends of long text so failures at the tail remain visible.
 * `max` must exceed {@link CAPTURE_ELISION_MARKER} length.
 */
export function captureHeadTail(text: string, max = VERIFY_CAPTURE_MAX): string {
  if (text.length <= max) return text
  const marker = CAPTURE_ELISION_MARKER
  const tailBudget = Math.min(Math.floor(max * 0.45), max - marker.length - 1)
  const headBudget = max - marker.length - tailBudget
  if (headBudget <= 0 || tailBudget <= 0) {
    return `${text.slice(0, max - 1)}…`
  }
  return `${text.slice(0, headBudget)}${marker}${text.slice(-tailBudget)}`
}

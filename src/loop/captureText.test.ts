import { describe, expect, it } from 'vitest'
import { CAPTURE_ELISION_MARKER, captureHeadTail } from './captureText.js'

describe('captureHeadTail', () => {
  it('returns short text unchanged', () => {
    expect(captureHeadTail('hello')).toBe('hello')
  })

  it('keeps head and tail with an elision marker', () => {
    const text = `HEAD${'x'.repeat(200)}TAIL_END`
    const capped = captureHeadTail(text, 80)
    expect(capped).toContain(CAPTURE_ELISION_MARKER)
    expect(capped.startsWith('HEAD')).toBe(true)
    expect(capped.endsWith('TAIL_END')).toBe(true)
    expect(capped.length).toBeLessThanOrEqual(80)
  })
})

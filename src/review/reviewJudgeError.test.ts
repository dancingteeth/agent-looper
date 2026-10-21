import { describe, expect, it } from 'vitest'
import { classifyReviewJudgeError } from './reviewJudgeError.js'

describe('classifyReviewJudgeError', () => {
  it('classifies timeouts', () => {
    expect(classifyReviewJudgeError('Cursor agent run timed out after 480000ms')).toBe('timeout')
  })

  it('classifies transport errors', () => {
    expect(classifyReviewJudgeError('fetch failed [layer=transport]')).toBe('provider')
  })

  it('classifies text-without-tools stalls', () => {
    expect(
      classifyReviewJudgeError(
        'OpenCode session made no tool progress after 480000ms (text stream without tools)',
      ),
    ).toBe('no_tool_calls')
  })

  it('falls back to other', () => {
    expect(classifyReviewJudgeError('something unexpected')).toBe('other')
  })
})

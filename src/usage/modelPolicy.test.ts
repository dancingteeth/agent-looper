import { describe, expect, it } from 'vitest'
import { assertLoopModelAllowed, isBannedCursorLoopModel } from './modelPolicy.js'

describe('modelPolicy', () => {
  it('flags Composer Fast variants as banned', () => {
    expect(isBannedCursorLoopModel('composer-2.5-fast')).toBe(true)
    expect(isBannedCursorLoopModel('composer-fast')).toBe(true)
    expect(isBannedCursorLoopModel('composer-2.5')).toBe(false)
  })

  it('allows composer-2.5 for cursor runtime', () => {
    expect(() => assertLoopModelAllowed('cursor', 'composer-2.5')).not.toThrow()
  })

  it('rejects Composer Fast for cursor runtime', () => {
    expect(() => assertLoopModelAllowed('cursor', 'composer-2.5-fast')).toThrow(
      /banned/i,
    )
  })
})

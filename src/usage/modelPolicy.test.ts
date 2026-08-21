import { describe, expect, it } from 'vitest'
import {
  assertCursorSdkModelAllowed,
  assertLoopModelAllowed,
  isBannedCursorLoopModel,
} from './modelPolicy.js'

describe('modelPolicy', () => {
  it('flags Composer Fast variants as banned', () => {
    expect(isBannedCursorLoopModel('composer-2.5-fast')).toBe(true)
    expect(isBannedCursorLoopModel('composer-fast')).toBe(true)
    expect(isBannedCursorLoopModel('composer-2.5')).toBe(false)
    expect(isBannedCursorLoopModel('grok-4.5-fast')).toBe(true)
    expect(isBannedCursorLoopModel('grok-4.6-fast')).toBe(true)
  })

  it('allows composer-2.5 for cursor runtime worker', () => {
    expect(() => assertLoopModelAllowed('cursor', 'composer-2.5')).not.toThrow()
  })

  it('rejects Grok as worker model on cursor runtime', () => {
    expect(() => assertLoopModelAllowed('cursor', 'grok-4.6')).toThrow(/reviewModel/)
    expect(() => assertLoopModelAllowed('cursor', 'grok-4.5')).toThrow(/reviewModel/)
  })

  it('rejects Composer Fast for cursor runtime', () => {
    expect(() => assertLoopModelAllowed('cursor', 'composer-2.5-fast')).toThrow(/banned/i)
  })

  it('allows grok-4.6, grok-4.5, and composer-2.5 as review models', () => {
    expect(() => assertCursorSdkModelAllowed('grok-4.6', 'review')).not.toThrow()
    expect(() => assertCursorSdkModelAllowed('grok-4.5', 'review')).not.toThrow()
    expect(() => assertCursorSdkModelAllowed('composer-2.5', 'review')).not.toThrow()
  })

  it('rejects Grok as worker role', () => {
    expect(() => assertCursorSdkModelAllowed('grok-4.6', 'worker')).toThrow(/worker/)
  })
})

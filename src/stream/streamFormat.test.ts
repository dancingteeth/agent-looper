import { describe, expect, it } from 'vitest'
import { truncateStreamValue } from './streamFormat.js'

describe('truncateStreamValue', () => {
  it('returns short strings unchanged', () => {
    expect(truncateStreamValue('hello')).toBe('hello')
  })

  it('truncates long strings with an ellipsis', () => {
    expect(truncateStreamValue('abcdefghij', 5)).toBe('abcde…')
  })

  it('JSON-stringifies non-string values before truncating', () => {
    expect(truncateStreamValue({ a: 1 }, 7)).toBe('{"a":1}')
    expect(truncateStreamValue({ a: 1, b: 2 }, 8)).toBe('{"a":1,"…')
  })

  it('uses the default max of 200', () => {
    const long = 'x'.repeat(201)
    expect(truncateStreamValue(long)).toBe(`${'x'.repeat(200)}…`)
  })
})

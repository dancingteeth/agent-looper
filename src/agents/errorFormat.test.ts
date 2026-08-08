import { describe, expect, it } from 'vitest'
import {
  formatErrorChain,
  isTransportAgentError,
  isTransportErrorMessage,
} from './errorFormat.js'

describe('formatErrorChain', () => {
  it('includes cause and undici-style fields', () => {
    const cause = Object.assign(new Error('connect ECONNRESET 1.2.3.4:443'), {
      code: 'ECONNRESET',
      errno: -54,
      syscall: 'connect',
    })
    const err = new Error('fetch failed', { cause })
    expect(formatErrorChain(err)).toContain('fetch failed')
    expect(formatErrorChain(err)).toContain('ECONNRESET')
    expect(formatErrorChain(err)).toContain('syscall=connect')
  })

  it('falls back for non-Error values', () => {
    expect(formatErrorChain('plain')).toBe('plain')
  })
})

describe('isTransportAgentError', () => {
  it('matches bare fetch failed', () => {
    expect(isTransportAgentError(new Error('fetch failed'))).toBe(true)
    expect(isTransportErrorMessage('OpenCode session.prompt failed: fetch failed')).toBe(true)
  })

  it('does not match auth or validation', () => {
    expect(isTransportAgentError(new Error('Invalid API key'))).toBe(false)
    expect(isTransportAgentError(new Error('OpenCode session timed out after 1000ms'))).toBe(
      false,
    )
  })
})

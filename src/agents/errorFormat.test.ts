import { describe, expect, it } from 'vitest'
import {
  formatErrorChain,
  isHttp2StreamTransportError,
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

  it('matches Cursor SDK HTTP/2 stream refusals', () => {
    const err = new Error(
      '[unknown] [internal] Stream closed with error code NGHTTP2_REFUSED_STREAM',
    )
    expect(isTransportAgentError(err)).toBe(true)
    expect(isHttp2StreamTransportError(err)).toBe(true)
    expect(isHttp2StreamTransportError(new Error('Invalid API key'))).toBe(false)
  })

  it('matches Connect-node HTTP/2 RST_STREAM CANCEL from a detached team-repo RPC', () => {
    // Shape seen from @cursor/sdk 1.0.23 (getTeamReposOrEmptyIfNotInTeam → shouldBlockRead)
    // during a judge run: exit 1 via unhandled rejection before this pattern existed.
    const cause = Object.assign(new Error('http/2 stream closed with error code CANCEL (0x8)'), {
      name: 'ConnectError',
      rawMessage: 'http/2 stream closed with error code CANCEL (0x8)',
      code: 1,
    })
    const err = Object.assign(
      new Error('[unknown] [canceled] http/2 stream closed with error code CANCEL (0x8)'),
      {
        name: 'ConnectError',
        rawMessage: '[canceled] http/2 stream closed with error code CANCEL (0x8)',
        code: 2,
        cause,
      },
    )
    expect(isHttp2StreamTransportError(err)).toBe(true)
    expect(isTransportAgentError(err)).toBe(true)
    expect(isHttp2StreamTransportError(new Error('http/2 is great'))).toBe(false)
  })

  it('matches Connect-ES errors that only put NGHTTP2 on rawMessage', () => {
    const cause = Object.assign(new Error('Stream closed with error code NGHTTP2_REFUSED_STREAM'), {
      code: 'ERR_HTTP2_STREAM_ERROR',
    })
    const err = Object.assign(new Error(''), {
      rawMessage: 'Stream closed with error code NGHTTP2_REFUSED_STREAM',
      code: 13,
      cause,
    })
    expect(isHttp2StreamTransportError(err)).toBe(true)
  })
})

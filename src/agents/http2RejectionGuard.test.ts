import { afterEach, describe, expect, it, vi } from 'vitest'
import { installHttp2UnhandledRejectionGuard } from './http2RejectionGuard.js'

describe('installHttp2UnhandledRejectionGuard', () => {
  const releases: Array<() => void> = []

  afterEach(() => {
    while (releases.length > 0) releases.pop()?.()
    vi.restoreAllMocks()
  })

  function latestUnhandled(): (...args: unknown[]) => void {
    const listener = process.listeners('unhandledRejection').at(-1)
    if (!listener) throw new Error('missing unhandledRejection listener')
    return listener as (...args: unknown[]) => void
  }

  function latestUncaught(): (...args: unknown[]) => void {
    const listener = process.listeners('uncaughtException').at(-1)
    if (!listener) throw new Error('missing uncaughtException listener')
    return listener as (...args: unknown[]) => void
  }

  it('refcounts nested installs and ignores HTTP/2 stream refusals', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = installHttp2UnhandledRejectionGuard()
    const second = installHttp2UnhandledRejectionGuard()
    releases.push(second, first)

    const rejection = latestUnhandled()
    rejection(new Error('Stream closed with error code NGHTTP2_REFUSED_STREAM'))
    expect(errSpy.mock.calls.join(' ')).toMatch(/ignored detached HTTP\/2/)
    expect(() => rejection(new Error('real failure'))).toThrow(/real failure/)

    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as typeof process.exit)
    const uncaught = latestUncaught()
    uncaught(new Error('NGHTTP2_REFUSED_STREAM'))
    expect(exit).not.toHaveBeenCalled()
    uncaught(new Error('fatal'))
    expect(exit).toHaveBeenCalledWith(1)

    first()
    expect(process.listeners('unhandledRejection')).toContain(rejection)
    second()
    expect(process.listeners('unhandledRejection')).not.toContain(rejection)
    releases.length = 0
  })

  it('no-ops a second release of the same guard', () => {
    const before = process.listeners('unhandledRejection').length
    const release = installHttp2UnhandledRejectionGuard()
    expect(process.listeners('unhandledRejection').length).toBe(before + 1)
    release()
    release()
    expect(process.listeners('unhandledRejection').length).toBe(before)
  })
})

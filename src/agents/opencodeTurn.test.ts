import { describe, expect, it, vi } from 'vitest'
import {
  pickLatestAssistantMessage,
  resolveOpencodeEventSessionId,
  waitForOpencodeSessionTurn,
} from './opencodeTurn.js'

async function* eventsFrom(
  items: Array<{ type: string; properties?: Record<string, unknown> }>,
  delayMs = 0,
) {
  for (const item of items) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    yield item
  }
}

describe('pickLatestAssistantMessage', () => {
  it('returns the last assistant row', () => {
    const picked = pickLatestAssistantMessage([
      { info: { role: 'user' }, parts: [{ type: 'text', text: 'hi' }] },
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'one' }] },
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'two' }] },
    ])
    expect(picked?.parts[0]).toEqual({ type: 'text', text: 'two' })
  })
})

describe('resolveOpencodeEventSessionId', () => {
  it('reads sessionID from properties or info', () => {
    expect(
      resolveOpencodeEventSessionId({
        type: 'session.idle',
        properties: { sessionID: 'ses_a' },
      }),
    ).toBe('ses_a')
    expect(
      resolveOpencodeEventSessionId({
        type: 'message.updated',
        properties: { info: { sessionID: 'ses_b' } },
      }),
    ).toBe('ses_b')
  })
})

describe('waitForOpencodeSessionTurn', () => {
  it('resolves on session.idle for the target session', async () => {
    const result = await waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: eventsFrom([
        { type: 'message.updated', properties: { info: { sessionID: 'ses_a' } } },
        { type: 'session.idle', properties: { sessionID: 'ses_a' } },
      ]),
      heartbeatMs: 60_000,
      stallMs: 60_000,
      timeoutMs: 60_000,
    })
    expect(result).toEqual({ kind: 'idle' })
  })

  it('accepts sid-less session.idle for the single waiter', async () => {
    const result = await waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: eventsFrom([{ type: 'session.idle', properties: {} }]),
      heartbeatMs: 60_000,
      stallMs: 60_000,
      timeoutMs: 60_000,
    })
    expect(result).toEqual({ kind: 'idle' })
  })

  it('ignores other sessions and surfaces session.error', async () => {
    const result = await waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: eventsFrom([
        { type: 'session.idle', properties: { sessionID: 'ses_other' } },
        {
          type: 'session.error',
          properties: {
            sessionID: 'ses_a',
            error: { name: 'ApiError', message: 'boom' },
          },
        },
      ]),
      heartbeatMs: 60_000,
      stallMs: 60_000,
      timeoutMs: 60_000,
    })
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.message).toContain('ApiError')
    }
  })

  it('emits heartbeats while waiting', async () => {
    vi.useFakeTimers()
    const heartbeats: Array<{ phase: string; busy: boolean }> = []
    const pending = waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: (async function* () {
        await new Promise<void>(() => {
          /* never ends until timeout/stall */
        })
      })(),
      heartbeatMs: 1000,
      stallMs: 60_000,
      timeoutMs: 60_000,
      onHeartbeat: (info) => heartbeats.push({ phase: info.phase, busy: info.busy }),
    })

    await vi.advanceTimersByTimeAsync(3000)
    expect(heartbeats.length).toBeGreaterThanOrEqual(2)
    expect(heartbeats[0]?.phase).toBe('awaiting_first_byte')

    await vi.advanceTimersByTimeAsync(60_000)
    const result = await pending
    expect(result.kind).toBe('error')
    vi.useRealTimers()
  })

  it('stalls on TTFB when no session-scoped events arrive', async () => {
    vi.useFakeTimers()
    const pending = waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: (async function* () {
        // Sid-less noise must not clear the TTFB stall.
        yield { type: 'server.connected', properties: {} }
        await new Promise<void>(() => {
          /* hang */
        })
      })(),
      heartbeatMs: 60_000,
      stallMs: 2000,
      timeoutMs: 60_000,
    })
    await vi.advanceTimersByTimeAsync(2000)
    const result = await pending
    expect(result.kind).toBe('error')
    if (result.kind === 'error') {
      expect(result.message).toMatch(/stalled after 2000ms waiting for first session event/)
      expect(result.message).toContain('[layer=transport]')
    }
    vi.useRealTimers()
  })

  it('does not stall after first activity during a long quiet busy turn', async () => {
    vi.useFakeTimers()
    let releaseIdle: (() => void) | undefined
    const idleGate = new Promise<void>((resolve) => {
      releaseIdle = resolve
    })

    const pending = waitForOpencodeSessionTurn({
      sessionId: 'ses_a',
      events: (async function* () {
        yield {
          type: 'session.status',
          properties: { sessionID: 'ses_a', status: { type: 'busy' } },
        }
        yield {
          type: 'message.updated',
          properties: { info: { sessionID: 'ses_a' } },
        }
        // Long quiet tool — previously tripped a re-armed 3m stall.
        await idleGate
        yield { type: 'session.idle', properties: { sessionID: 'ses_a' } }
      })(),
      heartbeatMs: 60_000,
      stallMs: 2000,
      timeoutMs: 60_000,
    })

    await vi.advanceTimersByTimeAsync(10_000)
    releaseIdle?.()
    const result = await pending
    expect(result).toEqual({ kind: 'idle' })
    vi.useRealTimers()
  })
})

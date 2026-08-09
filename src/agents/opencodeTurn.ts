import type { StreamCollector } from '../stream/streamCollect.js'

/** Overall implement/review turn cap (tools + model). */
export const OPENCODE_SESSION_TIMEOUT_MS = 45 * 60 * 1000

/**
 * Time-to-first-byte / first session-scoped event.
 * Only armed before any activity for this session — long quiet tool runs must
 * not trip this (they rely on OPENCODE_SESSION_TIMEOUT_MS instead).
 */
export const OPENCODE_STALL_MS = 3 * 60 * 1000

/** Stderr heartbeat while waiting on promptAsync → session.idle. */
export const OPENCODE_HEARTBEAT_MS = 30_000

export type OpencodeAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
}

type OpencodeEvent = {
  type: string
  properties?: Record<string, unknown>
}

export type WaitOpencodeTurnResult =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }

export function resolveOpencodeEventSessionId(
  event: OpencodeEvent,
): string | undefined {
  const props = event.properties ?? {}
  if (typeof props.sessionID === 'string') return props.sessionID
  if (typeof props.sessionId === 'string') return props.sessionId
  const info = props.info as { sessionID?: string; sessionId?: string } | undefined
  if (typeof info?.sessionID === 'string') return info.sessionID
  if (typeof info?.sessionId === 'string') return info.sessionId
  return undefined
}

function sessionStatusIsBusy(status: unknown): boolean {
  if (!status || typeof status !== 'object') return false
  const type = (status as { type?: unknown }).type
  return type === 'busy' || type === 'retry'
}

/**
 * Wait for session.idle / session.error after promptAsync.
 * Heartbeats keep cloud polls honest. Stall only covers TTFB (no session-scoped
 * events yet) — once the turn is busy, only the overall timeout applies.
 */
export async function waitForOpencodeSessionTurn(input: {
  sessionId: string
  events: AsyncIterable<OpencodeEvent>
  timeoutMs?: number
  stallMs?: number
  heartbeatMs?: number
  now?: () => number
  onHeartbeat?: (info: {
    elapsedMs: number
    lastEventType: string | undefined
    phase: 'awaiting_first_byte' | 'in_turn'
    busy: boolean
  }) => void
  signal?: AbortSignal
}): Promise<WaitOpencodeTurnResult> {
  const timeoutMs = input.timeoutMs ?? OPENCODE_SESSION_TIMEOUT_MS
  const stallMs = input.stallMs ?? OPENCODE_STALL_MS
  const heartbeatMs = input.heartbeatMs ?? OPENCODE_HEARTBEAT_MS
  const now = input.now ?? Date.now

  const startedAt = now()
  let lastEventAt = startedAt
  let lastEventType: string | undefined
  let seenSessionActivity = false
  let busy = false
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined
  let stallHandle: ReturnType<typeof setTimeout> | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const clearStall = () => {
    if (stallHandle) {
      clearTimeout(stallHandle)
      stallHandle = undefined
    }
  }

  const clearTimers = () => {
    if (heartbeatHandle) clearInterval(heartbeatHandle)
    clearStall()
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  const armTtfbStall = (resolve: (value: WaitOpencodeTurnResult) => void) => {
    clearStall()
    stallHandle = setTimeout(() => {
      resolve({
        kind: 'error',
        message: `OpenCode session stalled after ${stallMs}ms waiting for first session event (TTFB) [layer=transport]`,
      })
    }, stallMs)
    stallHandle.unref?.()
  }

  return await new Promise<WaitOpencodeTurnResult>((resolve) => {
    let settled = false
    const finish = (result: WaitOpencodeTurnResult) => {
      if (settled) return
      settled = true
      clearTimers()
      resolve(result)
    }

    const onAbort = () => {
      finish({ kind: 'error', message: 'OpenCode session wait aborted' })
    }
    if (input.signal?.aborted) {
      onAbort()
      return
    }
    input.signal?.addEventListener('abort', onAbort, { once: true })

    timeoutHandle = setTimeout(() => {
      finish({
        kind: 'error',
        message: `OpenCode session timed out after ${timeoutMs}ms`,
      })
    }, timeoutMs)
    timeoutHandle.unref?.()

    heartbeatHandle = setInterval(() => {
      input.onHeartbeat?.({
        elapsedMs: now() - startedAt,
        lastEventType,
        phase: seenSessionActivity ? 'in_turn' : 'awaiting_first_byte',
        busy,
      })
    }, heartbeatMs)
    heartbeatHandle.unref?.()

    // Stall only until the provider/session shows life.
    armTtfbStall(finish)

    ;(async () => {
      try {
        for await (const event of input.events) {
          if (settled) break

          const sid = resolveOpencodeEventSessionId(event)
          // Sid-less noise must not count as activity (except terminal idle/error below).
          const isTerminal =
            event.type === 'session.idle' || event.type === 'session.error'
          if (!sid && !isTerminal) continue
          if (sid && sid !== input.sessionId) continue

          const props = event.properties ?? {}
          lastEventAt = now()
          lastEventType = event.type

          if (!seenSessionActivity) {
            seenSessionActivity = true
            clearStall()
          }

          if (event.type === 'session.status') {
            busy = sessionStatusIsBusy(props.status)
          }

          if (event.type === 'session.idle') {
            // Accept idle for our sid, or sid-less idle (single waiter).
            if (!sid || sid === input.sessionId) {
              finish({ kind: 'idle' })
              break
            }
            continue
          }

          if (event.type === 'session.error') {
            if (sid && sid !== input.sessionId) continue
            const err = props.error as { name?: string; message?: string } | undefined
            const errName = err?.name ?? 'Error'
            const errMsg = err?.message ? String(err.message) : errName
            finish({
              kind: 'error',
              message: `OpenCode session.error (${errName}): ${errMsg}`,
            })
            break
          }
        }
        if (!settled) {
          finish({
            kind: 'error',
            message: `OpenCode event stream ended before session.idle (last=${lastEventType ?? 'none'} at +${lastEventAt - startedAt}ms)`,
          })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        finish({ kind: 'error', message: `OpenCode event stream failed: ${message}` })
      } finally {
        input.signal?.removeEventListener('abort', onAbort)
      }
    })().catch(() => undefined)
  })
}

export function pickLatestAssistantMessage<
  T extends {
    info: { role: string; error?: { name?: string; message?: string }; tokens?: unknown; cost?: number }
    parts: ReadonlyArray<{ type?: string; text?: string }>
  },
>(messages: readonly T[]): T | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i]!
    if (row.info.role === 'assistant') return row
  }
  return undefined
}

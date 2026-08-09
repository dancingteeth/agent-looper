import type { StreamCollector } from '../stream/streamCollect.js'

/** Overall implement/review turn cap (tools + model). */
export const OPENCODE_SESSION_TIMEOUT_MS = 45 * 60 * 1000

/** No session events after this → treat as provider/transport stall. */
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

/**
 * Wait for session.idle / session.error after promptAsync.
 * Heartbeats keep cloud polls honest; stallMs fails fast when the provider
 * never starts streaming (the old blocking session.prompt hit UND_ERR_HEADERS_TIMEOUT).
 */
export async function waitForOpencodeSessionTurn(input: {
  sessionId: string
  events: AsyncIterable<OpencodeEvent>
  timeoutMs?: number
  stallMs?: number
  heartbeatMs?: number
  now?: () => number
  onHeartbeat?: (elapsedMs: number, lastEventType: string | undefined) => void
  signal?: AbortSignal
}): Promise<WaitOpencodeTurnResult> {
  const timeoutMs = input.timeoutMs ?? OPENCODE_SESSION_TIMEOUT_MS
  const stallMs = input.stallMs ?? OPENCODE_STALL_MS
  const heartbeatMs = input.heartbeatMs ?? OPENCODE_HEARTBEAT_MS
  const now = input.now ?? Date.now

  const startedAt = now()
  let lastEventAt = startedAt
  let lastEventType: string | undefined
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined
  let stallHandle: ReturnType<typeof setTimeout> | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const clearTimers = () => {
    if (heartbeatHandle) clearInterval(heartbeatHandle)
    if (stallHandle) clearTimeout(stallHandle)
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }

  const armStall = (resolve: (value: WaitOpencodeTurnResult) => void) => {
    if (stallHandle) clearTimeout(stallHandle)
    stallHandle = setTimeout(() => {
      resolve({
        kind: 'error',
        message: `OpenCode session stalled after ${stallMs}ms with no events (last=${lastEventType ?? 'none'}) [layer=transport]`,
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
      input.onHeartbeat?.(now() - startedAt, lastEventType)
    }, heartbeatMs)
    heartbeatHandle.unref?.()

    armStall(finish)

    ;(async () => {
      try {
        for await (const event of input.events) {
          if (settled) break
          const props = event.properties ?? {}
          const eventSessionId =
            typeof props.sessionID === 'string'
              ? props.sessionID
              : typeof props.sessionId === 'string'
                ? props.sessionId
                : undefined

          // message.updated carries info.sessionID
          const info = props.info as { sessionID?: string } | undefined
          const fromInfo = info?.sessionID
          const sid = eventSessionId ?? fromInfo
          if (sid && sid !== input.sessionId) continue

          lastEventAt = now()
          lastEventType = event.type
          armStall(finish)

          if (event.type === 'session.idle' && sid === input.sessionId) {
            finish({ kind: 'idle' })
            break
          }
          if (event.type === 'session.error') {
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

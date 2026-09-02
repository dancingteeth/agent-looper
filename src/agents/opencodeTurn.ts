import type { StreamCollector } from '../stream/streamCollect.js'
import { truncateStreamValue as truncate } from '../stream/streamFormat.js'

/** Overall implement/review turn cap (tools + model). */
export const OPENCODE_SESSION_TIMEOUT_MS = 45 * 60 * 1000

/**
 * Time-to-first-byte / first session-scoped event.
 * Only armed before any activity for this session — long quiet tool runs must
 * not trip this (they rely on OPENCODE_SESSION_TIMEOUT_MS instead).
 */
export const OPENCODE_STALL_MS = 3 * 60 * 1000

/**
 * After the turn is alive, the model must start a tool (or go idle) within this
 * window. Token streaming (`message.part.updated` text) is not progress — Flash
 * can ramble until the 45m wall with heartbeats looking healthy. Quiet tool
 * runs after the first tool still use OPENCODE_SESSION_TIMEOUT_MS.
 */
export const OPENCODE_NO_TOOL_STALL_MS = 8 * 60 * 1000

/** Stderr heartbeat while waiting on promptAsync → session.idle. */
export const OPENCODE_HEARTBEAT_MS = 30_000

export type OpencodeAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
}

type OpencodeEvent = {
  type: string
  properties?: Record<string, unknown>
}

/**
 * Live OpenCode `Part.type` values that are not a tool/file action.
 * Text + reasoning are the Flash ramble; step/retry/compaction fire without
 * tools. Anything else (`tool`, `file`, `patch`, `subtask`, `agent`, …) is
 * progress so a newly added tool part is not killed by the 8m stall.
 * @see https://github.com/sst/opencode/blob/dev/packages/sdk/js/src/gen/types.gen.ts
 */
const NON_TOOL_PROGRESS_PART_TYPES = new Set([
  'text',
  'reasoning',
  'step-start',
  'step-finish',
  'retry',
  'compaction',
])

export function isOpencodeToolProgressEvent(event: OpencodeEvent): boolean {
  if (event.type === 'permission.updated' || event.type === 'file.edited') return true
  if (event.type !== 'message.part.updated') return false
  const part = event.properties?.part
  if (!part || typeof part !== 'object') return false
  const type = (part as { type?: unknown }).type
  return typeof type === 'string' && !NON_TOOL_PROGRESS_PART_TYPES.has(type)
}

type OpencodeToolPhase = 'start' | 'end-ok' | 'end-err'

export type OpencodeToolRecord = {
  id: string
  name: string
  phase: OpencodeToolPhase
  detail?: string
}

function toolStatusPhase(status: unknown): OpencodeToolPhase | undefined {
  if (typeof status !== 'string') return undefined
  const normalized = status.toLowerCase()
  if (normalized === 'completed' || normalized === 'success' || normalized === 'done') {
    return 'end-ok'
  }
  if (normalized === 'error' || normalized === 'failed' || normalized === 'failure') {
    return 'end-err'
  }
  if (
    normalized === 'pending' ||
    normalized === 'running' ||
    normalized === 'in_progress' ||
    normalized === 'start'
  ) {
    return 'start'
  }
  return undefined
}

function opencodePartToolName(part: Record<string, unknown>): string {
  if (typeof part.tool === 'string' && part.tool.trim()) return part.tool
  if (typeof part.name === 'string' && part.name.trim()) return part.name
  const state = part.state
  if (state && typeof state === 'object') {
    const named = (state as { name?: unknown; tool?: unknown })
    if (typeof named.tool === 'string' && named.tool.trim()) return named.tool
    if (typeof named.name === 'string' && named.name.trim()) return named.name
  }
  if (typeof part.type === 'string' && part.type.trim()) return part.type
  return 'tool'
}

function opencodePartId(part: Record<string, unknown>, name: string): string {
  if (typeof part.id === 'string' && part.id) return part.id
  if (typeof part.callID === 'string' && part.callID) return part.callID
  if (typeof part.callId === 'string' && part.callId) return part.callId
  return name
}

function opencodePartDetail(part: Record<string, unknown>): string | undefined {
  const state = part.state
  if (state && typeof state === 'object') {
    const input = (state as { input?: unknown }).input
    if (typeof input === 'string' && input.trim()) return truncate(input, 200)
    if (input && typeof input === 'object') {
      try {
        return truncate(JSON.stringify(input), 200)
      } catch {
        return undefined
      }
    }
  }
  return undefined
}

/** Map a live OpenCode event to a collector tool row when it is a real tool/file action. */
export function opencodeToolRecordFromEvent(event: OpencodeEvent): OpencodeToolRecord | undefined {
  if (event.type === 'file.edited') {
    const file =
      typeof event.properties?.file === 'string'
        ? event.properties.file
        : typeof event.properties?.path === 'string'
          ? event.properties.path
          : 'file'
    return { id: `edit:${file}`, name: 'edit', phase: 'start', detail: file }
  }
  if (event.type !== 'message.part.updated') return undefined
  const partRaw = event.properties?.part
  if (!partRaw || typeof partRaw !== 'object') return undefined
  const part = partRaw as Record<string, unknown>
  const type = part.type
  if (typeof type !== 'string' || NON_TOOL_PROGRESS_PART_TYPES.has(type)) return undefined
  const name = type === 'tool' ? opencodePartToolName(part) : type
  const id = opencodePartId(part, name)
  const state = part.state
  const status =
    state && typeof state === 'object' ? (state as { status?: unknown }).status : undefined
  const phase = toolStatusPhase(status) ?? 'start'
  return { id, name, phase, detail: opencodePartDetail(part) }
}

export function recordOpencodeEventOnCollector(
  event: OpencodeEvent,
  collector: StreamCollector,
  started: Set<string>,
): void {
  const rec = opencodeToolRecordFromEvent(event)
  if (!rec) return
  if (rec.phase === 'start') {
    if (started.has(rec.id)) return
    started.add(rec.id)
    collector.recordToolStart(rec.name, rec.detail)
    return
  }
  if (!started.has(rec.id)) {
    started.add(rec.id)
    collector.recordToolStart(rec.name, rec.detail)
  }
  collector.recordToolEnd(rec.name, rec.phase === 'end-ok', rec.detail)
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

export type OpencodeTurnPhase = 'awaiting_first_byte' | 'awaiting_first_tool' | 'in_turn'

/**
 * Wait for session.idle / session.error after promptAsync.
 * Heartbeats keep cloud polls honest. TTFB stall covers silence before any
 * session-scoped event. After that, a separate no-tool stall covers text-only
 * streaming; quiet tool runs after the first tool use the overall timeout.
 */
export async function waitForOpencodeSessionTurn(input: {
  sessionId: string
  events: AsyncIterable<OpencodeEvent>
  timeoutMs?: number
  stallMs?: number
  noToolStallMs?: number
  heartbeatMs?: number
  now?: () => number
  collector?: StreamCollector
  onHeartbeat?: (info: {
    elapsedMs: number
    lastEventType: string | undefined
    phase: OpencodeTurnPhase
    busy: boolean
  }) => void
  signal?: AbortSignal
}): Promise<WaitOpencodeTurnResult> {
  const timeoutMs = input.timeoutMs ?? OPENCODE_SESSION_TIMEOUT_MS
  const stallMs = input.stallMs ?? OPENCODE_STALL_MS
  const noToolStallMs = input.noToolStallMs ?? OPENCODE_NO_TOOL_STALL_MS
  const heartbeatMs = input.heartbeatMs ?? OPENCODE_HEARTBEAT_MS
  const now = input.now ?? Date.now
  const toolStarts = new Set<string>()

  const startedAt = now()
  let lastEventAt = startedAt
  let lastEventType: string | undefined
  let seenSessionActivity = false
  let seenToolActivity = false
  let busy = false
  let heartbeatHandle: ReturnType<typeof setInterval> | undefined
  let stallHandle: ReturnType<typeof setTimeout> | undefined
  let noToolStallHandle: ReturnType<typeof setTimeout> | undefined
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  const turnPhase = (): OpencodeTurnPhase => {
    if (!seenSessionActivity) return 'awaiting_first_byte'
    if (!seenToolActivity) return 'awaiting_first_tool'
    return 'in_turn'
  }

  const clearStall = () => {
    if (stallHandle) {
      clearTimeout(stallHandle)
      stallHandle = undefined
    }
  }

  const clearNoToolStall = () => {
    if (noToolStallHandle) {
      clearTimeout(noToolStallHandle)
      noToolStallHandle = undefined
    }
  }

  const clearTimers = () => {
    if (heartbeatHandle) clearInterval(heartbeatHandle)
    clearStall()
    clearNoToolStall()
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

  const armNoToolStall = (resolve: (value: WaitOpencodeTurnResult) => void) => {
    if (seenToolActivity) return
    clearNoToolStall()
    noToolStallHandle = setTimeout(() => {
      resolve({
        kind: 'error',
        message: `OpenCode session made no tool progress after ${noToolStallMs}ms (text stream without tools)`,
      })
    }, noToolStallMs)
    noToolStallHandle.unref?.()
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
        phase: turnPhase(),
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
          if (!sid && !isTerminal) {
            if (input.collector && seenSessionActivity) {
              recordOpencodeEventOnCollector(event, input.collector, toolStarts)
            }
            continue
          }
          if (sid && sid !== input.sessionId) continue

          const props = event.properties ?? {}
          lastEventAt = now()
          lastEventType = event.type

          if (!seenSessionActivity) {
            seenSessionActivity = true
            clearStall()
            armNoToolStall(finish)
          }

          if (isOpencodeToolProgressEvent(event)) {
            seenToolActivity = true
            clearNoToolStall()
          }
          if (input.collector) {
            recordOpencodeEventOnCollector(event, input.collector, toolStarts)
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

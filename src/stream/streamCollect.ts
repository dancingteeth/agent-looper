import { truncateStreamValue as truncate } from './streamFormat.js'

export type AgentSessionRef = {
  provider: 'cursor' | 'cline' | 'opencode'
  runId?: string
  sessionId?: string
  agentId?: string
}

export type TranscriptEvent = {
  at: string
  type: 'tool_start' | 'tool_end' | 'thinking' | 'status'
  phase?: 'implement' | 'review' | 'verify'
  iteration?: number
  name?: string
  detail?: string
}

export type StreamCollectorOptions = {
  phase?: TranscriptEvent['phase']
  iteration?: number
  includeThinking?: boolean
}

export class StreamCollector {
  readonly toolSummary: Record<string, number> = {}
  readonly events: TranscriptEvent[] = []
  private readonly phase?: TranscriptEvent['phase']
  private readonly iteration?: number
  private readonly includeThinking: boolean

  constructor(options: StreamCollectorOptions = {}) {
    this.phase = options.phase
    this.iteration = options.iteration
    this.includeThinking = options.includeThinking ?? false
  }

  private baseEvent(
    type: TranscriptEvent['type'],
    extra: Omit<TranscriptEvent, 'at' | 'type' | 'phase' | 'iteration'> = {},
  ): TranscriptEvent {
    return {
      at: new Date().toISOString(),
      type,
      ...(this.phase ? { phase: this.phase } : {}),
      ...(this.iteration !== undefined ? { iteration: this.iteration } : {}),
      ...extra,
    }
  }

  recordToolStart(name: string, detail?: string): void {
    this.toolSummary[name] = (this.toolSummary[name] ?? 0) + 1
    this.events.push(this.baseEvent('tool_start', { name, detail }))
  }

  recordToolEnd(name: string, ok: boolean, detail?: string): void {
    this.events.push(
      this.baseEvent('tool_end', {
        name,
        detail: ok ? detail : `error: ${detail ?? 'failed'}`,
      }),
    )
  }

  recordThinking(text: string, durationMs?: number): void {
    if (!this.includeThinking) return
    this.events.push(
      this.baseEvent('thinking', {
        detail: `${durationMs ?? '?'}ms: ${truncate(text, 240)}`,
      }),
    )
  }

  recordStatus(message: string): void {
    this.events.push(this.baseEvent('status', { detail: message }))
  }
}

export function formatToolSummary(summary: Record<string, number> | undefined): string {
  if (!summary || Object.keys(summary).length === 0) return '(no tool calls recorded)'
  return Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}×${count}`)
    .join(', ')
}

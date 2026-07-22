import type { AgentEvent, CoreSessionEvent } from '@cline/sdk'
import type { StreamCollector } from './streamCollect.js'
import { truncateStreamValue as truncate } from './streamFormat.js'

export function printClineAgentEvent(
  event: AgentEvent,
  options: { verbose: boolean; collector?: StreamCollector },
): void {
  switch (event.type) {
    case 'iteration_start':
      if (options.verbose) {
        console.error(`[agent-loop:cline] iteration ${event.iteration} start`)
      }
      break
    case 'iteration_end':
      if (options.verbose) {
        console.error(
          `[agent-loop:cline] iteration ${event.iteration} end tools=${event.toolCallCount}`,
        )
      }
      break
    case 'content_start':
      if (event.contentType === 'tool') {
        const toolName = event.toolName ?? 'tool'
        console.error(`[agent-loop:cline] tool ▶ ${toolName}`)
        options.collector?.recordToolStart(
          toolName,
          options.verbose && event.input !== undefined ? truncate(event.input, 200) : undefined,
        )
        if (options.verbose && event.input !== undefined) {
          console.error(`[agent-loop:cline]   args ${truncate(event.input)}`)
        }
      }
      break
    case 'content_end':
      if (event.contentType === 'tool') {
        const toolName = event.toolName ?? 'tool'
        const status = event.error ? '✗' : '✓'
        console.error(`[agent-loop:cline] tool ${status} ${toolName}`)
        options.collector?.recordToolEnd(
          toolName,
          !event.error,
          options.verbose && event.output !== undefined ? truncate(event.output, 200) : undefined,
        )
        if (options.verbose && event.output !== undefined) {
          console.error(`[agent-loop:cline]   → ${truncate(event.output)}`)
        }
      }
      break
    case 'notice':
      if (options.verbose || event.noticeType === 'stop') {
        console.error(`[agent-loop:cline] notice (${event.noticeType}): ${event.message}`)
      }
      options.collector?.recordStatus(event.message)
      break
    case 'error':
      console.error(`[agent-loop:cline] error: ${event.error.message}`)
      break
    case 'content_update':
    case 'usage':
    case 'done':
      break
    default:
      if (options.verbose) {
        console.error(`[agent-loop:cline] event ${(event as AgentEvent).type}`)
      }
      break
  }
}

export function handleClineSessionEvent(
  event: CoreSessionEvent,
  sessionId: string,
  options: { verbose: boolean; assistantOutput: 'stdout' | 'none'; collector?: StreamCollector },
  onDone: (text: string) => void,
  onError: (error: Error) => void,
): void {
  if (event.type === 'agent_event' && event.payload.sessionId === sessionId) {
    const agentEvent = event.payload.event
    printClineAgentEvent(agentEvent, options)

    if (agentEvent.type === 'content_start' && agentEvent.contentType === 'text' && agentEvent.text) {
      if (options.assistantOutput === 'stdout') {
        process.stdout.write(agentEvent.text)
      }
    }

    if (agentEvent.type === 'done') {
      if (options.assistantOutput === 'stdout' && agentEvent.text) {
        process.stdout.write(agentEvent.text)
      }
      onDone(agentEvent.text)
    }

    if (agentEvent.type === 'error' && !agentEvent.recoverable) {
      onError(agentEvent.error)
    }
  }

  if (event.type === 'chunk' && event.payload.sessionId === sessionId) {
    if (options.verbose && event.payload.stream === 'stderr') {
      console.error(`[agent-loop:cline] ${event.payload.chunk.trimEnd()}`)
    }
  }
}

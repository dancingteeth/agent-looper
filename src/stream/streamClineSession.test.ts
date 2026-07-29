import { describe, expect, it, vi } from 'vitest'
import type { AgentEvent, CoreSessionEvent } from '@cline/sdk'
import { StreamCollector } from './streamCollect.js'
import { handleClineSessionEvent, printClineAgentEvent } from './streamClineSession.js'

describe('printClineAgentEvent', () => {
  it('records tool start/end and notices into the collector', () => {
    const collector = new StreamCollector()
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    printClineAgentEvent(
      {
        type: 'content_start',
        contentType: 'tool',
        toolName: 'Shell',
        input: { cmd: 'ls' },
      } as AgentEvent,
      { verbose: true, collector },
    )
    printClineAgentEvent(
      {
        type: 'content_end',
        contentType: 'tool',
        toolName: 'Shell',
        output: 'ok',
      } as AgentEvent,
      { verbose: true, collector },
    )
    printClineAgentEvent(
      {
        type: 'content_end',
        contentType: 'tool',
        toolName: 'Shell',
        error: new Error('fail'),
      } as AgentEvent,
      { verbose: false, collector },
    )
    printClineAgentEvent(
      { type: 'notice', noticeType: 'stop', message: 'halted' } as AgentEvent,
      { verbose: false, collector },
    )
    printClineAgentEvent(
      { type: 'error', error: new Error('boom') } as AgentEvent,
      { verbose: false, collector },
    )
    printClineAgentEvent({ type: 'iteration_start', iteration: 1 } as AgentEvent, {
      verbose: true,
      collector,
    })
    printClineAgentEvent(
      { type: 'iteration_end', iteration: 1, toolCallCount: 2 } as AgentEvent,
      { verbose: true, collector },
    )
    printClineAgentEvent({ type: 'usage' } as AgentEvent, { verbose: false, collector })

    expect(collector.toolSummary).toEqual({ Shell: 1 })
    expect(collector.events.some((e) => e.type === 'tool_end' && e.detail === 'error: failed')).toBe(
      true,
    )
    expect(collector.events.some((e) => e.type === 'status' && e.detail === 'halted')).toBe(true)
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('error: boom'))).toBe(true)

    stderr.mockRestore()
  })
})

describe('handleClineSessionEvent', () => {
  it('routes matching agent_event payloads and ignores other sessions', () => {
    const collector = new StreamCollector()
    const onDone = vi.fn()
    const onError = vi.fn()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    const opts = {
      verbose: true,
      assistantOutput: 'stdout' as const,
      collector,
    }

    handleClineSessionEvent(
      {
        type: 'agent_event',
        payload: {
          sessionId: 'other',
          event: { type: 'done', text: 'nope' },
        },
      } as CoreSessionEvent,
      'sess-1',
      opts,
      onDone,
      onError,
    )
    expect(onDone).not.toHaveBeenCalled()

    handleClineSessionEvent(
      {
        type: 'agent_event',
        payload: {
          sessionId: 'sess-1',
          event: { type: 'content_start', contentType: 'text', text: 'hi' },
        },
      } as CoreSessionEvent,
      'sess-1',
      opts,
      onDone,
      onError,
    )
    expect(stdout).toHaveBeenCalledWith('hi')

    handleClineSessionEvent(
      {
        type: 'agent_event',
        payload: {
          sessionId: 'sess-1',
          event: { type: 'done', text: 'final' },
        },
      } as CoreSessionEvent,
      'sess-1',
      opts,
      onDone,
      onError,
    )
    expect(onDone).toHaveBeenCalledWith('final')

    handleClineSessionEvent(
      {
        type: 'agent_event',
        payload: {
          sessionId: 'sess-1',
          event: {
            type: 'error',
            recoverable: false,
            error: new Error('fatal'),
          },
        },
      } as CoreSessionEvent,
      'sess-1',
      opts,
      onDone,
      onError,
    )
    expect(onError).toHaveBeenCalledWith(expect.any(Error))

    handleClineSessionEvent(
      {
        type: 'chunk',
        payload: { sessionId: 'sess-1', stream: 'stderr', chunk: 'warn\n' },
      } as CoreSessionEvent,
      'sess-1',
      opts,
      onDone,
      onError,
    )
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('warn'))).toBe(true)

    stdout.mockRestore()
    stderr.mockRestore()
  })

  it('does not write assistant text when assistantOutput is none', () => {
    const onDone = vi.fn()
    const onError = vi.fn()
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    handleClineSessionEvent(
      {
        type: 'agent_event',
        payload: {
          sessionId: 'sess-1',
          event: { type: 'done', text: 'final' },
        },
      } as CoreSessionEvent,
      'sess-1',
      { verbose: false, assistantOutput: 'none' },
      onDone,
      onError,
    )

    expect(onDone).toHaveBeenCalledWith('final')
    expect(stdout).not.toHaveBeenCalled()
    stdout.mockRestore()
  })
})

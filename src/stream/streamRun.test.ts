import { describe, expect, it, vi } from 'vitest'
import type { SDKMessage } from '@cursor/sdk'
import { StreamCollector } from './streamCollect.js'
import { printRunStream } from './streamRun.js'

async function* events(...items: SDKMessage[]): AsyncGenerator<SDKMessage, void> {
  for (const item of items) yield item
}

function msg(partial: Record<string, unknown>): SDKMessage {
  return partial as unknown as SDKMessage
}

describe('printRunStream', () => {
  it('records system/status/thinking/tool_call into the collector', async () => {
    const collector = new StreamCollector({ includeThinking: true })
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await printRunStream(
      events(
        msg({
          type: 'system',
          run_id: 'r1',
          model: { id: 'composer-2.5' },
          tools: ['Shell'],
        }),
        msg({ type: 'request', request_id: 'req-1' }),
        msg({ type: 'status', status: 'running', message: 'working' }),
        msg({ type: 'thinking', text: 'hmm', thinking_duration_ms: 9 }),
        msg({
          type: 'tool_call',
          name: 'Shell',
          status: 'running',
          args: { cmd: 'ls' },
        }),
        msg({
          type: 'tool_call',
          name: 'Shell',
          status: 'completed',
          result: 'ok',
        }),
        msg({
          type: 'tool_call',
          name: 'Shell',
          status: 'error',
          result: 'boom',
        }),
        msg({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'hello' },
              { type: 'tool_use', name: 'Read', input: { path: 'a.ts' } },
            ],
          },
        }),
        msg({
          type: 'user',
          message: { content: [{ text: 'go' }] },
        }),
        msg({ type: 'task', status: 'done', text: 'finished' }),
      ),
      { verbose: true, collector },
    )

    expect(collector.toolSummary).toEqual({ Shell: 1 })
    expect(collector.events.some((e) => e.type === 'status' && e.detail === 'working')).toBe(true)
    expect(collector.events.some((e) => e.type === 'thinking')).toBe(true)
    expect(collector.events.some((e) => e.type === 'tool_end' && e.detail === 'error: boom')).toBe(
      true,
    )
    expect(stdout).toHaveBeenCalledWith('hello')
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('request_id=req-1'))).toBe(true)

    stderr.mockRestore()
    stdout.mockRestore()
  })

  it('suppresses assistant stdout when assistantOutput is none', async () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    await printRunStream(
      events(
        msg({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'secret' }] },
        }),
      ),
      { verbose: false, assistantOutput: 'none' },
    )

    expect(stdout).not.toHaveBeenCalled()
    stderr.mockRestore()
    stdout.mockRestore()
  })

  it('skips verbose-only paths when verbose is false', async () => {
    const collector = new StreamCollector({ includeThinking: true })
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})

    await printRunStream(
      events(
        msg({ type: 'system', run_id: 'r1' }),
        msg({ type: 'thinking', text: 'quiet' }),
        msg({ type: 'task', text: 't' }),
        msg({
          type: 'tool_call',
          name: 'Read',
          status: 'running',
          args: { path: 'x' },
        }),
      ),
      { verbose: false, collector },
    )

    expect(collector.events.find((e) => e.type === 'tool_start')?.detail).toBeUndefined()
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('thinking'))).toBe(false)

    stderr.mockRestore()
  })
})

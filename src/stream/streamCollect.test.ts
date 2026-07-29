import { describe, expect, it } from 'vitest'
import { StreamCollector, formatToolSummary } from './streamCollect.js'

describe('StreamCollector', () => {
  it('records tool starts into summary and events with phase/iteration', () => {
    const collector = new StreamCollector({ phase: 'implement', iteration: 2 })
    collector.recordToolStart('Shell', 'ls')
    collector.recordToolStart('Shell')
    collector.recordToolStart('Read', 'foo.ts')

    expect(collector.toolSummary).toEqual({ Shell: 2, Read: 1 })
    expect(collector.events).toHaveLength(3)
    expect(collector.events[0]).toMatchObject({
      type: 'tool_start',
      name: 'Shell',
      detail: 'ls',
      phase: 'implement',
      iteration: 2,
    })
    expect(collector.events[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('prefixes tool_end detail with error: when not ok', () => {
    const collector = new StreamCollector()
    collector.recordToolEnd('Shell', true, 'ok')
    collector.recordToolEnd('Shell', false, 'boom')
    collector.recordToolEnd('Shell', false)

    expect(collector.events[0]?.detail).toBe('ok')
    expect(collector.events[1]?.detail).toBe('error: boom')
    expect(collector.events[2]?.detail).toBe('error: failed')
  })

  it('skips thinking unless includeThinking is set', () => {
    const quiet = new StreamCollector()
    quiet.recordThinking('secret', 12)
    expect(quiet.events).toHaveLength(0)

    const noisy = new StreamCollector({ includeThinking: true })
    noisy.recordThinking('secret', 12)
    expect(noisy.events[0]).toMatchObject({
      type: 'thinking',
      detail: '12ms: secret',
    })

    noisy.recordThinking('x'.repeat(300))
    expect(noisy.events[1]?.detail).toMatch(/^\?ms: .{240}…$/)
  })

  it('records status messages', () => {
    const collector = new StreamCollector({ phase: 'review' })
    collector.recordStatus('waiting')
    expect(collector.events[0]).toMatchObject({
      type: 'status',
      detail: 'waiting',
      phase: 'review',
    })
  })
})

describe('formatToolSummary', () => {
  it('returns a placeholder when empty or undefined', () => {
    expect(formatToolSummary(undefined)).toBe('(no tool calls recorded)')
    expect(formatToolSummary({})).toBe('(no tool calls recorded)')
  })

  it('sorts tools by count descending', () => {
    expect(formatToolSummary({ Read: 1, Shell: 3, Write: 2 })).toBe('Shell×3, Write×2, Read×1')
  })
})

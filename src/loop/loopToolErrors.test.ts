import { describe, expect, it } from 'vitest'
import {
  aggregateToolErrorsFromLog,
  classifyAgentMessageAsPlainTextTool,
  countToolEndErrors,
  mergeToolErrorStatRows,
  summarizeSessionToolErrors,
} from './loopToolErrors.js'

describe('loopToolErrors', () => {
  it('counts tool_end rows prefixed with error:', () => {
    const n = countToolEndErrors([
      { at: 't', type: 'tool_end', name: 'Read', detail: 'error: missing file' },
      { at: 't', type: 'tool_end', name: 'Shell', detail: 'ok' },
    ])
    expect(n).toBe(1)
  })

  it('classifies plain-text tool stalls', () => {
    expect(
      classifyAgentMessageAsPlainTextTool(
        'OpenCode session made no tool progress after 480000ms (text stream without tools)',
      ),
    ).toBe(true)
  })

  it('merges stats per role/runtime/model', () => {
    const merged = mergeToolErrorStatRows([
      {
        role: 'worker',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        toolEndErrors: 2,
        toolCallAsPlainText: 0,
      },
      {
        role: 'worker',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        toolEndErrors: 1,
        toolCallAsPlainText: 1,
      },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]!.toolEndErrors).toBe(3)
    expect(merged[0]!.toolCallAsPlainText).toBe(1)
  })

  it('aggregates tool errors from iteration logs', () => {
    const rows = aggregateToolErrorsFromLog([
      {
        toolErrorStats: [
          summarizeSessionToolErrors({
            role: 'judge',
            runtime: 'opencode',
            model: 'opencode-go/deepseek-v4-pro',
            transcriptEvents: [
              { at: 't', type: 'tool_end', name: 'Grep', detail: 'error: boom' },
            ],
          })!,
        ],
      },
    ])
    expect(rows[0]?.toolEndErrors).toBe(1)
  })
})

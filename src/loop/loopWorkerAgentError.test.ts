import { describe, expect, it } from 'vitest'
import { AgentRunFailedError } from '../agents/agentRunFailed.js'
import { classifyWorkerAgentError, extractPartialWorkerRun } from './loopWorkerAgentError.js'

describe('classifyWorkerAgentError', () => {
  it('treats connection stalls as transient', () => {
    expect(classifyWorkerAgentError(new Error('Connection stalled repeatedly'))).toBe('transient')
  })

  it('treats missing API key as fatal', () => {
    expect(classifyWorkerAgentError(new Error('CURSOR_API_KEY is not set'))).toBe('fatal')
  })

  it('does not treat rate-limit text mentioning api key as fatal', () => {
    expect(
      classifyWorkerAgentError(
        new Error('rate limit: retry after 60s (api key tier=pro)'),
      ),
    ).toBe('transient')
  })

  it('treats empty Cursor result as transient', () => {
    expect(classifyWorkerAgentError(new Error('Cursor agent returned empty result'))).toBe(
      'transient',
    )
  })
})

describe('extractPartialWorkerRun', () => {
  it('returns partial usage from AgentRunFailedError', () => {
    const usage = {
      phase: 'implement' as const,
      runtime: 'cursor' as const,
      model: 'composer-2.5',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      costSource: 'estimated' as const,
    }
    const err = new AgentRunFailedError('Cursor agent run failed (status=error)', {
      usage,
      text: '',
    })
    expect(extractPartialWorkerRun(err)?.usage).toEqual(usage)
  })
})

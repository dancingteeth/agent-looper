import { describe, expect, it } from 'vitest'
import { emptyUsageSummary, type LoopUsageRecord } from '../usage/loopUsage.js'
import type { LoopIterationLog } from './agentLoop.js'
import type { FailureDomainEntry } from './loopFailureDomain.js'
import {
  buildLoopRunScoreboard,
  formatDurationMs,
  formatScoreboardMarkdown,
  formatScoreboardTelegramLine,
} from './loopRunScoreboard.js'

const verifyPass = {
  complete: true,
  command: 'bash verify.sh',
  exitCode: 0,
  stdout: '',
  stderr: '',
  reason: 'ok',
}

const verifyFail = {
  ...verifyPass,
  complete: false,
  exitCode: 1,
  reason: 'fail',
}

function entry(overrides: Partial<LoopIterationLog> = {}): LoopIterationLog {
  return {
    at: '2026-08-29T00:00:00.000Z',
    iteration: 1,
    branch: 'main',
    shortSha: 'abc1234',
    verify: verifyPass,
    assistantPreview: 'ok',
    ...overrides,
  }
}

const implementUsage: LoopUsageRecord = {
  phase: 'implement',
  runtime: 'cursor',
  model: 'composer-2.5',
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0.12,
  costSource: 'estimated',
}

const reviewUsage: LoopUsageRecord = {
  ...implementUsage,
  phase: 'review',
  model: 'grok-4.6',
  costUsd: 0.04,
}

describe('formatDurationMs', () => {
  it('formats ms, seconds, and minutes', () => {
    expect(formatDurationMs(0)).toBe('—')
    expect(formatDurationMs(400)).toBe('400ms')
    expect(formatDurationMs(1500)).toBe('1.5s')
    expect(formatDurationMs(12_000)).toBe('12s')
    expect(formatDurationMs(65_000)).toBe('1m 05s')
  })
})

describe('buildLoopRunScoreboard', () => {
  it('rolls up timings, kills, retries, cost, and HITL', () => {
    const domains: FailureDomainEntry[] = [
      {
        at: '2026-08-29T00:01:00.000Z',
        iteration: 2,
        reason: 'review_gate_hitl',
        fingerprint: 'fp',
        verify: { command: 'bash verify.sh', exitCode: 0, reason: 'ok' },
        suggestion: 'HITL',
        status: 'waiting',
      },
      {
        at: '2026-08-29T00:00:30.000Z',
        iteration: 1,
        reason: 'agent_error',
        fingerprint: 'timeout',
        verify: { command: '(agent SDK)', exitCode: null, reason: 'timed out' },
        suggestion: 'escalate',
      },
    ]

    const board = buildLoopRunScoreboard({
      entries: [
        entry({
          iteration: 1,
          verify: verifyFail,
          sdkRetries: 1,
          durationsMs: { worker: 8000, verify: 2000 },
        }),
        entry({
          iteration: 2,
          review: { verdict: 'BLOCKERS', risk: 'medium', blockersCount: 1 },
          durationsMs: { worker: 4000, verify: 1000, judge: 9000 },
        }),
      ],
      failureDomains: domains,
      usage: {
        ...emptyUsageSummary(),
        records: [implementUsage, reviewUsage],
        totalCostUsd: 0.16,
        totalInputTokens: 200,
        totalOutputTokens: 100,
        totalCacheReadTokens: 0,
        totalCacheWriteTokens: 0,
      },
    })

    expect(board.iterations).toBe(2)
    expect(board.checkerRounds).toBe(2)
    expect(board.verifyFails).toBe(1)
    expect(board.workerFaults).toBe(0)
    expect(board.reviewsRun).toBe(1)
    expect(board.reviewKills).toBe(1)
    expect(board.sdkRetries).toBe(1)
    expect(board.workerMs).toBe(12_000)
    expect(board.verifyMs).toBe(3000)
    expect(board.judgeMs).toBe(9000)
    expect(board.implementCostUsd).toBeCloseTo(0.12)
    expect(board.reviewCostUsd).toBeCloseTo(0.04)
    expect(board.hitl).toBe(true)
    expect(board.failureCounts.agent_error).toBe(1)
    expect(board.failureCounts.review_gate_hitl).toBe(1)

    const md = formatScoreboardMarkdown(board).join('\n')
    expect(md).toContain('## Report card')
    expect(md).toContain('Checker sent back')
    expect(md).toContain('1 of 1 (kill rate 100%)')
    expect(md).toContain('yes (HITL)')
    expect(md).toContain('~$0.1200')
    expect(md).toContain('agent_error×1')

    expect(formatScoreboardTelegramLine(board)).toMatch(
      /Report card: 2 iters · checker sent back 1 · referee bounce 1\/1 · needed you: yes/,
    )
  })

  it('does not count hung-worker rows as checker bounces', () => {
    const board = buildLoopRunScoreboard({
      entries: [
        entry({
          iteration: 1,
          verify: {
            complete: false,
            command: '(agent SDK)',
            exitCode: null,
            stdout: '',
            stderr: 'OpenCode session timed out after 2700000ms',
            reason: 'Worker timed out or made no tool progress — next iteration uses qwen.',
          },
          durationsMs: { worker: 8_000 },
        }),
        entry({
          iteration: 2,
          verify: verifyPass,
          durationsMs: { worker: 4000, verify: 1000 },
        }),
      ],
      failureDomains: [],
      usage: emptyUsageSummary(),
    })

    expect(board.iterations).toBe(2)
    expect(board.checkerRounds).toBe(1)
    expect(board.verifyFails).toBe(0)
    expect(board.workerFaults).toBe(1)
    expect(formatScoreboardMarkdown(board).join('\n')).toContain('| Writer hung | 1 |')
    expect(formatScoreboardMarkdown(board).join('\n')).toContain('| Checker sent back | 0 of 1 |')
    expect(formatScoreboardTelegramLine(board)).toMatch(
      /Report card: 2 iters · checker sent back 0 · writer hung 1 · referee bounce n\/a/,
    )
  })

  it('treats no reviews as n/a rather than 0% kill', () => {
    const board = buildLoopRunScoreboard({
      entries: [entry()],
      failureDomains: [],
      usage: emptyUsageSummary(),
    })
    expect(board.reviewsRun).toBe(0)
    expect(board.reviewKills).toBe(0)
    expect(formatScoreboardMarkdown(board).join('\n')).toContain('no review this run')
    expect(formatScoreboardTelegramLine(board)).toContain('referee bounce n/a')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { createLoopAgentSession } from '../agents/agentRunner.js'
import {
  createHitlCheckTask,
  markTaskwarriorDoneByUuid,
  runTaskwarriorSync,
} from '../integrations/taskwarrior.js'
import { captureGitWorkspaceSnapshot } from './loopGit.js'
import { runAgentLoop } from './agentLoop.js'
import { loopConfigSchema } from './loopConfig.js'
import { runVerifyCommand, type VerifyResult } from './loopVerify.js'
import { runPostLoopQualityReview, runPostLoopBlockerRecheck } from '../review/loopPostReview.js'
import type { PostLoopReviewResult } from '../review/loopPostReview.js'

vi.mock('../agents/agentRunner.js', () => ({
  createLoopAgentSession: vi.fn(),
  loopRuntimeLabel: vi.fn(() => 'cursor'),
}))

vi.mock('./loopVerify.js', () => ({
  runVerifyCommand: vi.fn(),
}))

vi.mock('../review/loopPostReview.js', () => ({
  runPostLoopQualityReview: vi.fn(),
  runPostLoopBlockerRecheck: vi.fn(),
}))

vi.mock('../integrations/taskwarrior.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integrations/taskwarrior.js')>()
  return {
    ...actual,
    createHitlCheckTask: vi.fn(),
    markTaskwarriorDoneByUuid: vi.fn(),
    runTaskwarriorSync: vi.fn(),
  }
})

vi.mock('./loopGit.js', () => ({
  captureGitWorkspaceSnapshot: vi.fn(() => ({
    branch: 'main',
    shortSha: 'abc1234',
    diffStat: '',
    statusPorcelain: '',
  })),
}))

const mockedCreateSession = vi.mocked(createLoopAgentSession)
const mockedRunVerify = vi.mocked(runVerifyCommand)
const mockedCaptureGit = vi.mocked(captureGitWorkspaceSnapshot)

let tmpLoopDir: string

function passVerify(command = 'true'): VerifyResult {
  return {
    complete: true,
    command,
    exitCode: 0,
    stdout: '',
    stderr: '',
    reason: 'Verifier passed (exit 0).',
  }
}

function failVerify(stdout = 'FAIL same'): VerifyResult {
  return {
    complete: false,
    command: 'false',
    exitCode: 1,
    stdout,
    stderr: '',
    reason: 'Verifier failed (exit 1).',
  }
}

function makeCtx(syncCommand: string | null = null) {
  return {
    repoRoot: process.cwd(),
    profile: repoProfileSchema.parse({ syncCommand }),
  }
}

function makeBundle(overrides: Record<string, unknown> = {}) {
  const config = loopConfigSchema.parse({
    verify: 'true',
    maxIterations: 3,
    delayMs: 0,
    postQualityReview: false,
    syncOnSuccess: false,
    stagnationThreshold: 3,
    ...overrides,
  })
  return {
    loopDir: tmpLoopDir,
    goal: 'Fix harness tests under @dancingteeth/agent-loop.',
    config,
    logPath: path.join(tmpLoopDir, 'log.ndjson'),
  }
}

function reviewResult(
  verdict: 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN',
  blockers: string[] = [],
): PostLoopReviewResult {
  return {
    text: `### Verdict\n**${verdict}**\n\n### Blockers\n${blockers.map((b) => `- ${b}`).join('\n')}`,
    parsed: {
      verdict,
      risk: 'medium',
      blockers,
    },
    outPath: path.join(tmpLoopDir, 'review.md'),
  }
}

function mockSession(runIterationPrompt = vi.fn().mockResolvedValue({ text: 'assistant ok' })) {
  const dispose = vi.fn().mockResolvedValue(undefined)
  mockedCreateSession.mockResolvedValue({
    runIterationPrompt,
    dispose,
  })
  return { runIterationPrompt, dispose }
}

describe('runAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tmpLoopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-run-'))
    mockedCaptureGit.mockReturnValue({
      branch: 'main',
      shortSha: 'abc1234',
      diffStat: '',
      statusPorcelain: '',
    })
  })

  it('completes on the first passing verifier', async () => {
    const { dispose } = mockSession()
    mockedRunVerify.mockReturnValue(passVerify())

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle(),
    })

    expect(result.complete).toBe(true)
    expect(result.iterations).toBe(1)
    expect(dispose).toHaveBeenCalledOnce()
    expect(runPostLoopQualityReview).not.toHaveBeenCalled()
  })

  it('retries after a failed verifier and completes on the next pass', async () => {
    const { runIterationPrompt } = mockSession()
    mockedRunVerify.mockReturnValueOnce(failVerify('FAIL first')).mockReturnValueOnce(passVerify())

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ maxIterations: 2 }),
    })

    expect(result.complete).toBe(true)
    expect(result.iterations).toBe(2)
    expect(runIterationPrompt).toHaveBeenCalledTimes(2)
  })

  it('runs finalVerify after the inner verifier passes', async () => {
    mockSession()
    mockedRunVerify
      .mockReturnValueOnce(passVerify('inner'))
      .mockReturnValueOnce(passVerify('final'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ finalVerify: 'pnpm test' }),
    })

    expect(result.complete).toBe(true)
    expect(mockedRunVerify).toHaveBeenCalledTimes(2)
    expect(mockedRunVerify.mock.calls[1]?.[0]).toBe('pnpm test')
  })

  it('stops early when stagnation threshold is reached', async () => {
    const { runIterationPrompt } = mockSession()
    mockedRunVerify.mockReturnValue(failVerify('FAIL same signature'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ maxIterations: 8, stagnationThreshold: 3 }),
    })

    expect(result.complete).toBe(false)
    expect(result.iterations).toBe(3)
    expect(result.completionReason).toMatch(/stagnation/i)
    expect(runIterationPrompt).toHaveBeenCalledTimes(3)
  })

  it('returns incomplete when max iterations are exhausted', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(failVerify('FAIL always'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ maxIterations: 2, stagnationThreshold: 0 }),
    })

    expect(result.complete).toBe(false)
    expect(result.iterations).toBe(2)
    expect(result.completionReason).toMatch(/Max iterations/)
  })

  it('retries the agent session on transient SDK errors', async () => {
    vi.useFakeTimers()
    const runIterationPrompt = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValueOnce({ text: 'recovered' })
    mockSession(runIterationPrompt)
    mockedRunVerify.mockReturnValue(passVerify())

    const pending = runAgentLoop({ ctx: makeCtx(), bundle: makeBundle() })
    await vi.runAllTimersAsync()
    const result = await pending

    expect(result.complete).toBe(true)
    expect(runIterationPrompt).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('marks taskwarrior done, creates HITL check, and runs sync on success', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())

    await runAgentLoop({
      ctx: makeCtx('pnpm tasks:sync'),
      bundle: makeBundle({
        syncOnSuccess: true,
        taskwarriorUuid: 'a74a94d1-2069-4e05-861e-de80143b0526',
        hitlCheck: 'Manual QA after harness change',
        taskwarriorProject: 'dxp',
      }),
    })

    expect(markTaskwarriorDoneByUuid).toHaveBeenCalledWith('a74a94d1-2069-4e05-861e-de80143b0526')
    expect(createHitlCheckTask).toHaveBeenCalledWith('Manual QA after harness change', 'dxp')
    expect(runTaskwarriorSync).toHaveBeenCalledWith('pnpm tasks:sync', process.cwd())
  })

  it('invokes onIterationStart for each loop iteration', async () => {
    mockSession()
    mockedRunVerify.mockReturnValueOnce(failVerify()).mockReturnValueOnce(passVerify())
    const onIterationStart = vi.fn()

    await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ maxIterations: 2 }),
      onIterationStart,
    })

    expect(onIterationStart).toHaveBeenCalledTimes(2)
    expect(onIterationStart).toHaveBeenNthCalledWith(1, 1)
    expect(onIterationStart).toHaveBeenNthCalledWith(2, 2)
  })

  it('disposes the agent session and logs a failure domain when the verifier throws', async () => {
    const { dispose } = mockSession()
    mockedRunVerify.mockImplementation(() => {
      throw new Error('shell exploded')
    })

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({ maxIterations: 1 }),
    })

    expect(result.complete).toBe(false)
    expect(result.completionReason).toMatch(/shell exploded/)
    expect(dispose).toHaveBeenCalledOnce()
    const domains = fs
      .readFileSync(path.join(tmpLoopDir, 'failure-domains.ndjson'), 'utf8')
      .trim()
      .split('\n')
    expect(domains).toHaveLength(1)
    expect(JSON.parse(domains[0]!).reason).toBe('agent_error')
  })

  it('continues loop when review gate returns BLOCKERS then completes on a re-check PASS', async () => {
    const { runIterationPrompt } = mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValueOnce({
      ...reviewResult('BLOCKERS', ['[must-fix] **Docs missing** — README still template']),
      outPath: path.join(tmpLoopDir, 'review.md'),
    })
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValueOnce({
      ...reviewResult('PASS'),
      outPath: path.join(tmpLoopDir, 'review.2.md'),
    })

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 4,
      }),
    })

    expect(result.complete).toBe(true)
    expect(result.iterations).toBe(2)
    expect(runIterationPrompt).toHaveBeenCalledTimes(2)
    const secondPrompt = runIterationPrompt.mock.calls[1]?.[0] as string
    expect(secondPrompt).toContain('Review blockers (must fix)')
    expect(secondPrompt).toContain('Docs missing')
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(1)
    expect(runPostLoopBlockerRecheck).toHaveBeenCalledTimes(1)
    expect(markTaskwarriorDoneByUuid).not.toHaveBeenCalled()
  })

  it('exits incomplete when review gate exhausts maxReviewCycles on BLOCKERS', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Unit guard** — verify doc.unit']),
    )
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Unit guard** — verify doc.unit']),
    )

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 5,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.completionReason).toMatch(/Review gate: BLOCKERS/)
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(1)
    expect(runPostLoopBlockerRecheck).toHaveBeenCalledTimes(1)
  })

  it('exits incomplete when review gate is on and quality review throws', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockRejectedValue(new Error('Cursor SDK unavailable'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 3,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.completionReason).toMatch(/Review gate: quality review failed/)
    expect(markTaskwarriorDoneByUuid).not.toHaveBeenCalled()
  })

  it('retries the review on an unparseable verdict instead of re-running the agent', async () => {
    const { runIterationPrompt } = mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview)
      .mockResolvedValueOnce({
        ...reviewResult('UNKNOWN'),
        outPath: path.join(tmpLoopDir, 'review.md'),
      })
      .mockResolvedValueOnce({
        ...reviewResult('PASS'),
        outPath: path.join(tmpLoopDir, 'review.2.md'),
      })

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 4,
      }),
    })

    // UNKNOWN is a transient parse glitch: the review retries in-place, the agent
    // is not re-run, and the loop completes on the subsequent PASS.
    expect(result.complete).toBe(true)
    expect(result.iterations).toBe(1)
    expect(runIterationPrompt).toHaveBeenCalledTimes(1)
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(2)
  })

  it('stops when review gate exhausts maxReviewCycles on unparseable verdict', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(reviewResult('UNKNOWN'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 5,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.completionReason).toMatch(/unparseable verdict/)
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(2)
  })

  it('escalates reasoning effort on the BLOCKERS fix round (ClinePass)', async () => {
    const { runIterationPrompt } = mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValueOnce(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README missing']),
    )
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValueOnce(reviewResult('PASS'))

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        runtime: 'cline-pass',
        reasoningEffort: 'low',
        escalateReasoningEffort: 'xhigh',
        reviewGate: true,
        maxReviewCycles: 2,
        maxIterations: 4,
      }),
    })

    expect(result.complete).toBe(true)
    expect(runIterationPrompt).toHaveBeenCalledTimes(2)
    const firstAgent = runIterationPrompt.mock.calls[0]?.[1] as { reasoningEffort?: string }
    const fixRoundAgent = runIterationPrompt.mock.calls[1]?.[1] as { reasoningEffort?: string }
    expect(firstAgent.reasoningEffort).toBe('low')
    // BLOCKERS fix round escalates the reasoning tier (bounded by the ceiling).
    expect(fixRoundAgent.reasoningEffort).toBe('high')
  })

  it('completes with reviewAdvisoryBlockers when BLOCKERS are advisory only', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — missing README section']),
    )

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        postQualityReview: true,
        reviewGate: false,
      }),
    })

    expect(result.complete).toBe(true)
    expect(result.reviewAdvisoryBlockers).toBe(true)
  })

  it('escalates to HITL instead of hard-failing when reviewGate exhausts and reviewGateHitl is set', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(createHitlCheckTask).mockReturnValue('hitl-uuid-123')
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README still template']),
    )
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README still template']),
    )

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        reviewGateHitl: true,
        taskwarriorProject: 'dxp',
        maxReviewCycles: 2,
        maxIterations: 5,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.reviewEscalatedToHitl).toBe(true)
    expect(result.hitlCheckTaskUuid).toBeDefined()
    expect(result.completionReason).toMatch(/escalated to human review/i)
    expect(createHitlCheckTask).toHaveBeenCalledOnce()
    expect(markTaskwarriorDoneByUuid).not.toHaveBeenCalled()
  })

  it('still hard-fails when reviewGate exhausts and reviewGateHitl is off', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README still template']),
    )
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README still template']),
    )

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        reviewGateHitl: false,
        maxReviewCycles: 2,
        maxIterations: 5,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.reviewEscalatedToHitl).toBeUndefined()
    expect(createHitlCheckTask).not.toHaveBeenCalled()
    expect(result.completionReason).toMatch(/Review gate: BLOCKERS/)
  })

  it('runs the full review on a fix round when reviewBlockerRecheck is disabled', async () => {
    mockSession()
    mockedRunVerify.mockReturnValue(passVerify())
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(
      reviewResult('BLOCKERS', ['[must-fix] **Docs** — README still template']),
    )

    const result = await runAgentLoop({
      ctx: makeCtx(),
      bundle: makeBundle({
        reviewGate: true,
        reviewBlockerRecheck: false,
        maxReviewCycles: 2,
        maxIterations: 5,
      }),
    })

    expect(result.complete).toBe(false)
    expect(result.completionReason).toMatch(/Review gate: BLOCKERS/)
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(2)
    expect(runPostLoopBlockerRecheck).not.toHaveBeenCalled()
  })
})

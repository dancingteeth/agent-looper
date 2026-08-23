import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
vi.mock('../integrations/hitlCheckpoint.js', () => ({
  createHitlCheckpoint: vi.fn(),
  hitlLoopOverridesFrom: vi.fn((c) => c),
}))
import { createHitlCheckpoint } from '../integrations/hitlCheckpoint.js'
import { loopConfigSchema } from './loopConfig.js'
import {
  resolvePostSuccessReviewOutcome,
  reviewGateHitlDescription,
  runPostSuccessReviewPhase,
} from './loopPostSuccessReview.js'
import { runPostLoopBlockerRecheck, runPostLoopQualityReview } from '../review/loopPostReview.js'
import type { PostLoopReviewResult } from '../review/loopPostReview.js'
import { parseReviewMarkdown } from '../review/reviewVerdict.js'
import { CURSOR_REVIEW_MODEL, type CursorSdkModel, type ResolvedReviewAgent } from './loopAgentConfig.js'

vi.mock('../review/loopPostReview.js', () => ({
  runPostLoopQualityReview: vi.fn(),
  runPostLoopBlockerRecheck: vi.fn(),
}))

vi.mock('../integrations/taskwarrior.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../integrations/taskwarrior.js')>()
  return {
    ...actual,
  }
})

function gatingBlocker(title: string, detail: string, impact = 'false-closure'): string {
  return `severity: error impact: ${impact} [must-fix] **${title}** — ${detail}`
}

function reviewResult(
  verdict: 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN',
  blockers: string[] = [],
): PostLoopReviewResult {
  const text = `### Verdict\n**${verdict}**\n\n### Blockers\n${blockers.map((b) => `- ${b}`).join('\n')}`
  return {
    text,
    parsed: parseReviewMarkdown(text),
    outPath: '/tmp/review.md',
    usage: {
      phase: 'review',
      runtime: 'cursor',
      model: 'grok-4.5',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: 0,
      costSource: 'estimated',
    },
  }
}

function parsedReview(verdict: 'PASS' | 'ADVISORY' | 'BLOCKERS' | 'UNKNOWN', blockers: string[] = []) {
  const text = `### Verdict\n**${verdict}**\n\n### Blockers\n${blockers.map((b) => `- ${b}`).join('\n')}`
  return parseReviewMarkdown(text)
}

function baseConfig(overrides: Record<string, unknown> = {}) {
  return loopConfigSchema.parse({
    verify: 'true',
    postQualityReview: true,
    reviewGate: true,
    maxReviewCycles: 2,
    unparseableReviewRetries: 2,
    ...overrides,
  })
}

describe('reviewGateHitlDescription', () => {
  it('describes unparseable verdicts', () => {
    const parsed = parsedReview('UNKNOWN')
    expect(reviewGateHitlDescription(parsed, 2)).toContain('unparseable')
  })

  it('includes blocker summaries for BLOCKERS verdicts', () => {
    const parsed = parsedReview('BLOCKERS', [gatingBlocker('Docs', 'README missing')])
    expect(reviewGateHitlDescription(parsed, 2)).toContain('Docs')
  })
})

describe('resolvePostSuccessReviewOutcome', () => {
  const ctx = { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) }

  it('returns success when no parsed review', async () => {
    await expect(
      resolvePostSuccessReviewOutcome({
        config: baseConfig(),
        ctx,
        parsedReview: undefined,
        reviewCycle: 1,
        reviewCyclesUsed: 0,
        reasoningEffort: 'default',
      }),
    ).resolves.toEqual({ action: 'success' })
  })

  it('stops on unparseable verdict after retries', async () => {
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ reviewGateHitl: false }),
      ctx,
      parsedReview: parsedReview('UNKNOWN'),
      reviewCycle: 2,
      reviewCyclesUsed: 0,
      reasoningEffort: 'default',
    })
    expect(outcome.action).toBe('stop')
    if (outcome.action === 'stop') {
      expect(outcome.completionReason).toMatch(/unparseable verdict/)
      expect(outcome.failureDomainReason).toBe('review_gate')
    }
  })

  it('continues for a BLOCKERS fix round when cycles remain', async () => {
    const parsed = parsedReview('BLOCKERS', [gatingBlocker('Docs', 'README missing')])
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ maxReviewCycles: 2 }),
      ctx,
      parsedReview: parsed,
      reviewCycle: 1,
      reviewCyclesUsed: 0,
      reasoningEffort: 'low',
    })
    expect(outcome).toMatchObject({
      action: 'continue',
      reviewCyclesUsed: 1,
      gateBlockerCount: 1,
      reasoningEffort: 'low',
    })
    if (outcome.action === 'continue') {
      expect(outcome.reviewBlockers[0]).toContain('Docs')
      expect(outcome.guidePackets).toHaveLength(1)
      expect(outcome.guidePackets[0]!.reason).toMatch(/Docs/)
      expect(outcome.guidePackets[0]!.requiredChange).toMatch(/README missing/)
    }
  })

  it('stops when BLOCKERS exhaust maxReviewCycles', async () => {
    const parsed = parsedReview('BLOCKERS', [gatingBlocker('Docs', 'README missing')])
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ maxReviewCycles: 2, reviewGateHitl: false }),
      ctx,
      parsedReview: parsed,
      reviewCycle: 2,
      reviewCyclesUsed: 1,
      reasoningEffort: 'default',
    })
    expect(outcome.action).toBe('stop')
    if (outcome.action === 'stop') {
      expect(outcome.completionReason).toMatch(/BLOCKERS/)
    }
  })

  it('escalates to HITL when reviewGateHitl is set and cycles exhaust', async () => {
    vi.mocked(createHitlCheckpoint).mockResolvedValue('hitl-uuid')
    const parsed = parsedReview('BLOCKERS', [gatingBlocker('Docs', 'README missing')])
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ maxReviewCycles: 2, reviewGateHitl: true, taskwarriorProject: 'dxp' }),
      ctx,
      parsedReview: parsed,
      reviewCycle: 2,
      reviewCyclesUsed: 1,
      reasoningEffort: 'default',
    })
    expect(outcome).toMatchObject({
      action: 'stop',
      hitlCheckTaskUuid: 'hitl-uuid',
      reviewEscalatedToHitl: true,
      failureDomainReason: 'review_gate_hitl',
    })
    expect(createHitlCheckpoint).toHaveBeenCalledOnce()
  })

  it('completes with advisory blockers when reviewGate is off', async () => {
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ reviewGate: false }),
      ctx,
      parsedReview: parsedReview('BLOCKERS', ['[must-fix] **Docs** — missing README section']),
      reviewCycle: 1,
      reviewCyclesUsed: 0,
      reasoningEffort: 'default',
    })
    expect(outcome).toMatchObject({
      action: 'success',
      reviewAdvisoryBlockers: true,
    })
  })

  it('completes with advisory blockers when only warning/none-impact items gate', async () => {
    const outcome = await resolvePostSuccessReviewOutcome({
      config: baseConfig({ reviewGate: true }),
      ctx,
      parsedReview: parsedReview('BLOCKERS', [
        'severity: warning impact: none [should-fix] **Docs tone** — intro wording',
      ]),
      reviewCycle: 1,
      reviewCyclesUsed: 0,
      reasoningEffort: 'default',
    })
    expect(outcome).toMatchObject({
      action: 'success',
      reviewAdvisoryBlockers: true,
    })
  })
})

function cursorJudge(model: CursorSdkModel = CURSOR_REVIEW_MODEL): ResolvedReviewAgent {
  return { runtime: 'cursor', model }
}

describe('runPostSuccessReviewPhase', () => {
  beforeEach(() => {
    vi.mocked(runPostLoopQualityReview).mockReset()
    vi.mocked(runPostLoopBlockerRecheck).mockReset()
  })

  it('retries UNKNOWN verdicts up to unparseableReviewRetries', async () => {
    vi.mocked(runPostLoopQualityReview)
      .mockResolvedValueOnce(reviewResult('UNKNOWN'))
      .mockResolvedValueOnce(reviewResult('PASS'))

    const result = await runPostSuccessReviewPhase({
      config: baseConfig(),
      goal: 'Goal text',
      ctx: { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      loopDir: '/tmp/loop',
      reviewBlockers: undefined,
      reviewCyclesUsed: 0,
      reviewAgent: cursorJudge(),
      usageSummary: { records: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, totalCostUsd: 0 },
      reasoningEffort: 'default',
    })

    expect(result.outcome.action).toBe('success')
    expect(runPostLoopQualityReview).toHaveBeenCalledTimes(2)
    expect(runPostLoopQualityReview).toHaveBeenCalledWith(
      '/tmp/loop',
      'Goal text',
      expect.anything(),
      expect.objectContaining({ workerRuntime: 'cursor' }),
    )
    expect(runPostLoopBlockerRecheck).not.toHaveBeenCalled()
  })

  it('uses blocker recheck on fix rounds when reviewBlockerRecheck is enabled', async () => {
    vi.mocked(runPostLoopBlockerRecheck).mockResolvedValue(reviewResult('PASS'))

    await runPostSuccessReviewPhase({
      config: baseConfig(),
      goal: 'Goal text',
      ctx: { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      loopDir: '/tmp/loop',
      reviewBlockers: ['Docs missing'],
      reviewCyclesUsed: 1,
      reviewAgent: cursorJudge(),
      usageSummary: { records: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, totalCostUsd: 0 },
      reasoningEffort: 'default',
    })

    expect(runPostLoopBlockerRecheck).toHaveBeenCalledOnce()
    expect(runPostLoopBlockerRecheck).toHaveBeenCalledWith(
      '/tmp/loop',
      'Goal text',
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ workerRuntime: 'cursor' }),
    )
    expect(runPostLoopQualityReview).not.toHaveBeenCalled()
  })

  it('forwards the worker runtime into post-loop quality review', async () => {
    vi.mocked(runPostLoopQualityReview).mockResolvedValue(reviewResult('PASS'))

    await runPostSuccessReviewPhase({
      config: baseConfig({ runtime: 'dsh' }),
      goal: 'Goal text',
      ctx: { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      loopDir: '/tmp/loop',
      reviewBlockers: undefined,
      reviewCyclesUsed: 0,
      reviewAgent: cursorJudge(),
      usageSummary: { records: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, totalCostUsd: 0 },
      reasoningEffort: 'default',
    })

    expect(runPostLoopQualityReview).toHaveBeenCalledWith(
      '/tmp/loop',
      'Goal text',
      expect.anything(),
      expect.objectContaining({ workerRuntime: 'dsh' }),
    )
  })

  it('stops without iteration log when gated review throws', async () => {
    vi.mocked(runPostLoopQualityReview).mockRejectedValue(new Error('Cursor SDK unavailable'))

    const result = await runPostSuccessReviewPhase({
      config: baseConfig(),
      goal: 'Goal text',
      ctx: { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      loopDir: '/tmp/loop',
      reviewBlockers: undefined,
      reviewCyclesUsed: 0,
      reviewAgent: cursorJudge(),
      usageSummary: { records: [], totalInputTokens: 0, totalOutputTokens: 0, totalCacheReadTokens: 0, totalCacheWriteTokens: 0, totalCostUsd: 0 },
      reasoningEffort: 'default',
    })

    expect(result.outcome).toMatchObject({
      action: 'stop',
      completionReason: /quality review failed/,
      skipIterationLog: true,
    })
  })
})

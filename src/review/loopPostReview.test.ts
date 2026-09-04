import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  buildPostLoopQualityReviewPrompt,
  resolveReviewOutputPath,
  runPostLoopQualityReview,
} from './loopPostReview.js'
import { buildBlockerRecheckPrompt, buildReproduceCandidatesPrompt } from './reviewPrompt.js'
import { blockingBlockers } from './reviewVerdict.js'

const { runReviewAgentPrompt } = vi.hoisted(() => ({
  runReviewAgentPrompt: vi.fn(),
}))

const { createClineLoopSession, clineRunPrompt } = vi.hoisted(() => ({
  createClineLoopSession: vi.fn(),
  clineRunPrompt: vi.fn(),
}))

vi.mock('./reviewAgentRun.js', () => ({
  runReviewAgentPrompt,
}))

vi.mock('../agents/cursorAgent.js', () => ({
  runCursorAgentPrompt: vi.fn(),
}))

vi.mock('../agents/clineAgent.js', () => ({
  createClineLoopSession,
}))

vi.mock('../context/defaultBranch.js', () => ({
  defaultBranchRefExists: () => true,
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_cmd: string, args?: string[]) => {
    if (args?.[0] === 'merge-base') return 'abc123'
    if (args?.[0] === 'diff' && args.includes('--name-only')) {
      return 'src/cli/init.ts\nsrc/review/reviewVerdict.ts'
    }
    if (args?.[0] === 'diff' && args.includes('--stat')) {
      return ' src/cli/init.ts | 1 +\n'
    }
    return 'abc123'
  }),
}))

describe('loopPostReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runReviewAgentPrompt.mockResolvedValue({
      text: '### Verdict\n**PASS**\n\n### Blockers\n- none',
    })
    createClineLoopSession.mockResolvedValue({
      runPrompt: clineRunPrompt,
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    clineRunPrompt.mockResolvedValue({
      text: '### Verdict\n**PASS**\n\n### Blockers\n- none',
    })
  })

  it('includes risk triage and loop goal in prompt', () => {
    const ctx = resolveRepoContext()
    const prompt = buildPostLoopQualityReviewPrompt(ctx, 'Add Etsy PEC opener')

    expect(prompt).toContain('blast radius')
    expect(prompt).toContain('Add Etsy PEC opener')
    expect(prompt).toContain('post-loop quality review')
    expect(prompt).toContain('<untrusted-input kind="review-context">')
    expect(prompt).toContain('UNTRUSTED INPUT')
  })

  it('defaults review judge to grok-4.6 when reviewModel omitted (cursor worker default)', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }

    await runPostLoopQualityReview(loopDir, 'goal', ctx, { verbose: false })

    expect(runReviewAgentPrompt).toHaveBeenCalledWith(
      ctx,
      expect.any(String),
      { runtime: 'cursor', model: 'grok-4.6' },
      expect.objectContaining({ verbose: false }),
    )
  })

  it('uses explicit reviewModel (grok-4.5) when provided', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }

    await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      verbose: false,
      reviewAgent: { runtime: 'cursor', model: 'grok-4.5' },
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledWith(
      ctx,
      expect.any(String),
      { runtime: 'cursor', model: 'grok-4.5' },
      expect.any(Object),
    )
  })

  it('embeds REVIEWS.md when present in consumer repo', () => {
    const ctx = resolveRepoContext()
    const reviewsPath = path.join(ctx.repoRoot, ctx.profile.reviewsFile)
    if (!fs.existsSync(reviewsPath)) {
      return
    }
    const prompt = buildPostLoopQualityReviewPrompt(ctx, 'test goal')
    expect(prompt).toContain('Repository review standards')
    expect(prompt).not.toContain('(REVIEWS.md not found')
  })

  it('names review output files per cycle', () => {
    expect(resolveReviewOutputPath('/tmp/loop', 1)).toBe('/tmp/loop/review.md')
    expect(resolveReviewOutputPath('/tmp/loop', 2)).toBe('/tmp/loop/review.2.md')
    expect(resolveReviewOutputPath('/tmp/loop', 3)).toBe('/tmp/loop/review.3.md')
  })

  it('scopes the blocker re-check prompt to the flagged blockers only', () => {
    const ctx = resolveRepoContext()
    const prompt = buildBlockerRecheckPrompt(ctx, 'Fix harness', [
      '[must-fix] **Docs missing** — README',
      '[must-fix] **Unit guard** — verify doc.unit',
    ])
    expect(prompt).toContain('Do NOT introduce new blockers')
    expect(prompt).toContain('[must-fix] **Docs missing** — README')
    expect(prompt).toContain('[must-fix] **Unit guard** — verify doc.unit')
    expect(prompt).toContain('Fix harness')
    expect(prompt).toContain('<untrusted-input kind="loop-goal">')
    expect(prompt).toContain('<untrusted-input kind="reviews-md">')
  })

  it('asks the reproduce agent to KEEP or DROP each candidate in a fresh context', () => {
    const ctx = resolveRepoContext()
    const prompt = buildReproduceCandidatesPrompt(ctx, 'Ship M2b', [
      'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10',
    ])
    expect(prompt).toContain('fresh')
    expect(prompt).toContain('NOT seen the original review transcript')
    expect(prompt).toContain('KEEP')
    expect(prompt).toContain('DROP')
    expect(prompt).toContain('src/cli/init.ts:10')
    expect(prompt).toContain('<untrusted-input kind="loop-goal">')
  })

  it('skips reproduce agent when reviewReproduce is off', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: [
        '### Verdict',
        '**BLOCKERS**',
        '',
        '### Blockers',
        '- severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10',
      ].join('\n'),
    })

    await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      reviewReproduceAgent: true,
      reviewReproduce: false,
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(1)
  })

  it('runs reproduce agent after 2a filter and drops unevidenced blockers', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    const keptBlocker =
      'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10 still missing'
    const ghostBlocker =
      'severity: error impact: verify-bypass [must-fix] **Ghost** — src/review/reviewVerdict.ts:1 imaginary'
    runReviewAgentPrompt
      .mockResolvedValueOnce({
        text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', `- ${keptBlocker}`, `- ${ghostBlocker}`].join(
          '\n',
        ),
      })
      .mockResolvedValueOnce({
        text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', `- ${keptBlocker}`].join('\n'),
      })

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      reviewReproduce: true,
      reviewReproduceAgent: true,
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(2)
    expect(runReviewAgentPrompt.mock.calls[1]![2]).toEqual({
      runtime: 'cursor',
      model: 'grok-4.6',
    })
    expect(String(runReviewAgentPrompt.mock.calls[1]![1])).toContain('reproduce-before-report')

    expect(result.reproduceAgentDroppedCount).toBe(1)
    expect(blockingBlockers(result.parsed)).toHaveLength(1)
    expect(blockingBlockers(result.parsed)[0]!.title).toContain('Docs')

    const reviewMd = fs.readFileSync(path.join(loopDir, 'review.md'), 'utf8')
    expect(reviewMd).toContain('### Reproduce agent (fresh context)')
    expect(reviewMd).toContain('Dropped 1 gating blocker(s)')

    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('reproduce agent: verifying'))).toBe(
      true,
    )
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('reproduce agent: dropped 1'))).toBe(
      true,
    )

    stderrSpy.mockRestore()
  })

  it('skips secondary review when reviewSecondaryRuntime is unset', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', '- severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10'].join(
        '\n',
      ),
    })

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runPostLoopQualityReview(loopDir, 'goal', ctx, { verbose: false })

    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('secondary review: skipped (disabled)'))).toBe(
      false,
    )

    stderrSpy.mockRestore()
  })

  it('skips secondary review on primary PASS with no gating blockers when reviewGate is off', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      reviewSecondaryRuntime: 'cline-pass',
    })

    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(1)
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('secondary review: skipped (primary PASS with no gating blockers)'))).toBe(
      true,
    )

    stderrSpy.mockRestore()
  })

  it('runs secondary review on primary PASS when reviewGate is on', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**PASS**', '', '### Blockers', '- none'].join('\n'),
    })
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**PASS**', '', '### Blockers', '- none'].join('\n'),
    })

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      reviewSecondaryRuntime: 'dsh',
      reviewGate: true,
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(2)
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('secondary review: running'))).toBe(true)
    expect(
      stderrSpy.mock.calls.some((c) =>
        String(c[0]).includes('secondary review: skipped (primary PASS with no gating blockers)'),
      ),
    ).toBe(false)

    stderrSpy.mockRestore()
  })

  it('runs secondary review and merges secondary-only gating blockers', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    const primaryBlocker =
      'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10 still missing'
    const secondaryOnlyBlocker =
      'severity: error impact: verify-bypass [must-fix] **Verify gap** — src/review/reviewVerdict.ts:1'
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', `- ${primaryBlocker}`].join('\n'),
    })
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', `- ${secondaryOnlyBlocker}`].join('\n'),
    })

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      reviewSecondaryRuntime: 'dsh',
      reviewSecondaryModel: 'deepseek-official/deepseek-v4-pro',
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(2)
    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(blockingBlockers(result.parsed)).toHaveLength(2)
    expect(result.secondaryOnlyBlockersCount).toBe(1)
    expect(result.parsed.verdict).toBe('BLOCKERS')

    const reviewMd = fs.readFileSync(path.join(loopDir, 'review.md'), 'utf8')
    expect(reviewMd).toContain('Primary judge:')
    expect(reviewMd).toContain('Secondary model: deepseek-official/deepseek-v4-pro')
    expect(reviewMd).toContain('### Secondary review (dsh/deepseek-official/deepseek-v4-pro)')
    expect(reviewMd).toContain('### Secondary merge')
    expect(reviewMd).toContain('Verify gap')

    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('secondary review: running'))).toBe(true)
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('merged 1 secondary-only gating blocker'))).toBe(
      true,
    )

    stderrSpy.mockRestore()
  })

  it('defaults Cursor secondary to composer-2.5 when worker is not cursor', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }
    const primaryBlocker =
      'severity: error impact: false-closure [must-fix] **Docs** — src/cli/init.ts:10 still missing'
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**BLOCKERS**', '', '### Blockers', `- ${primaryBlocker}`].join('\n'),
    })
    runReviewAgentPrompt.mockResolvedValueOnce({
      text: ['### Verdict', '**PASS**', '', '### Blockers', '- none'].join('\n'),
    })

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runPostLoopQualityReview(loopDir, 'goal', ctx, {
      workerRuntime: 'dsh',
      reviewSecondaryRuntime: 'cursor',
    })

    expect(runReviewAgentPrompt).toHaveBeenCalledTimes(2)
    expect(runReviewAgentPrompt.mock.calls[1]![2]).toEqual({
      runtime: 'cursor',
      model: 'composer-2.5',
    })

    stderrSpy.mockRestore()
  })
})

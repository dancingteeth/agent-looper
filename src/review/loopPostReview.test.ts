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
import { buildBlockerRecheckPrompt } from './reviewPrompt.js'

const { runCursorAgentPrompt } = vi.hoisted(() => ({
  runCursorAgentPrompt: vi.fn(),
}))

vi.mock('../agents/cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('../context/defaultBranch.js', () => ({
  defaultBranchRefExists: () => true,
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'abc123'),
}))

describe('loopPostReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runCursorAgentPrompt.mockResolvedValue({
      text: '### Verdict\n**PASS**\n\n### Blockers\n- none',
    })
  })

  it('includes risk triage and loop goal in prompt', () => {
    const ctx = resolveRepoContext()
    const prompt = buildPostLoopQualityReviewPrompt(ctx, 'Add Etsy PEC opener')

    expect(prompt).toContain('blast radius')
    expect(prompt).toContain('Add Etsy PEC opener')
    expect(prompt).toContain('post-loop quality review')
  })

  it('defaults review role to composer-2.5 when reviewModel omitted', async () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-review-'))
    const ctx = {
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({}),
    }

    await runPostLoopQualityReview(loopDir, 'goal', ctx, { verbose: false })

    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      ctx,
      expect.any(String),
      expect.objectContaining({
        modelId: 'composer-2.5',
        role: 'review',
        phase: 'review',
      }),
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
      reviewModel: 'grok-4.5',
    })

    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      ctx,
      expect.any(String),
      expect.objectContaining({
        modelId: 'grok-4.5',
        role: 'review',
      }),
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
  })
})

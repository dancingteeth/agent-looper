import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { resolveRepoContext } from '../context/repoContext.js'
import { buildPostLoopQualityReviewPrompt } from './loopPostReview.js'
import { resolveReviewOutputPath } from './loopPostReview.js'

describe('loopPostReview', () => {
  it('includes risk triage and loop goal in prompt', () => {
    const ctx = resolveRepoContext()
    const prompt = buildPostLoopQualityReviewPrompt(ctx, 'Add Etsy PEC opener')

    expect(prompt).toContain('blast radius')
    expect(prompt).toContain('Add Etsy PEC opener')
    expect(prompt).toContain('post-loop quality review')
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
})

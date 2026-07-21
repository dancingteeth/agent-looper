import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import {
  buildMetaReviewPrompt,
  loadMetaReviewPromptBrief,
  META_REVIEW_PROMPT_RELATIVE,
} from './metaReviewPrompt.js'
import type { CollectedLoopArtifacts } from './metaReviewPrompt.js'

describe('metaReviewPrompt', () => {
  it('loads the in-repo meta-review brief', () => {
    const brief = loadMetaReviewPromptBrief(process.cwd())
    expect(brief).toContain('Cross-loop')
    expect(brief).toContain('HITL follow-ups')
  })

  it('builds prompt with loop artifacts and output sections', () => {
    const bundle: CollectedLoopArtifacts = {
      loopDir: '/tmp/loop-a',
      relPath: '.cursor/loops/loop-a',
      goal: 'Fix foo',
      review: { path: '/tmp/loop-a/review.md', content: '### Verdict\n**PASS**' },
      logNdjson: '{"iteration":1}',
      failureDomains: '{"reason":"review_gate"}',
      diffStat: ' src/foo.ts | 1 +',
      missing: [],
    }

    const prompt = buildMetaReviewPrompt(
      { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      [bundle],
    )

    expect(prompt).toContain('### Cross-loop themes')
    expect(prompt).toContain('### HITL follow-ups')
    expect(prompt).toContain(META_REVIEW_PROMPT_RELATIVE)
    expect(prompt).toContain('.cursor/loops/loop-a')
    expect(prompt).toContain('Fix foo')
    expect(prompt).toContain('src/foo.ts')
  })

  it('falls back when meta-review prompt file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-meta-prompt-'))
    const brief = loadMetaReviewPromptBrief(dir)
    expect(brief).toContain('meta-review prompt not found')
  })
})

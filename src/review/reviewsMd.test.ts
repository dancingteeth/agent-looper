import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { loadReviewsMd } from './reviewsMd.js'

const tmpRoots: string[] = []

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('loadReviewsMd', () => {
  it('returns fallback copy when REVIEWS.md is missing', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reviews-md-missing-'))
    tmpRoots.push(repoRoot)
    const profile = repoProfileSchema.parse({})
    expect(loadReviewsMd(repoRoot, profile)).toContain('REVIEWS.md not found')
  })

  it('reads trimmed REVIEWS.md from the repo profile path', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reviews-md-present-'))
    tmpRoots.push(repoRoot)
    fs.writeFileSync(path.join(repoRoot, 'REVIEWS.md'), '# Reviews\n\n## Loop risk inference\n')
    const profile = repoProfileSchema.parse({})
    expect(loadReviewsMd(repoRoot, profile)).toBe('# Reviews\n\n## Loop risk inference')
  })
})

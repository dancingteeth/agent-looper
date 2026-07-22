import fs from 'node:fs'
import path from 'node:path'
import type { RepoProfile } from '../context/repoProfile.js'

export function loadReviewsMd(repoRoot: string, profile: RepoProfile): string {
  const reviewsPath = path.join(repoRoot, profile.reviewsFile)
  if (!fs.existsSync(reviewsPath)) {
    return `(REVIEWS.md not found — apply code judo bar from AGENTS.md and repo coding standards.)`
  }
  return fs.readFileSync(reviewsPath, 'utf8').trim()
}

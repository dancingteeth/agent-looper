import { describe, expect, it } from 'vitest'
import { detectDefaultBranch } from './defaultBranch.js'
import { validateRepoProfile } from './repoProfileDoctor.js'
import { repoProfileSchema } from './repoProfile.js'

describe('validateRepoProfile', () => {
  it('accepts the current repo default branch', () => {
    const check = validateRepoProfile({
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({
        defaultBranch: detectDefaultBranch(process.cwd()),
      }),
    })
    expect(check.ok).toBe(true)
  })

  it('errors when defaultBranch ref is missing', () => {
    const check = validateRepoProfile({
      repoRoot: process.cwd(),
      profile: repoProfileSchema.parse({ defaultBranch: '__missing_branch__' }),
    })
    expect(check.ok).toBe(false)
    expect(check.errors[0]).toMatch(/defaultBranch/)
  })
})

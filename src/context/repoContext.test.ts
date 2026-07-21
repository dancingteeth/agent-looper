import { describe, expect, it } from 'vitest'
import { resolveRepoContext, resolveTaskwarriorProject } from './repoContext.js'
import { repoProfileSchema } from './repoProfile.js'

describe('repoProfileSchema', () => {
  it('does not default taskwarriorProject', () => {
    expect(repoProfileSchema.parse({}).taskwarriorProject).toBeUndefined()
  })

  it('accepts zwook project', () => {
    expect(repoProfileSchema.parse({ taskwarriorProject: 'zwook' }).taskwarriorProject).toBe(
      'zwook',
    )
  })

  it('rejects taskwarriorProject with spaces', () => {
    expect(() => repoProfileSchema.parse({ taskwarriorProject: 'my project' })).toThrow(
      /spaces/i,
    )
  })
})

describe('resolveRepoContext', () => {
  it('uses cwd when repo root omitted', () => {
    const ctx = resolveRepoContext()
    expect(ctx.repoRoot).toBe(process.cwd())
    // Dogfood profile in this repo sets taskwarriorProject; schema itself stays optional.
    expect(ctx.profile.defaultBranch).toBeTruthy()
  })
})

describe('resolveTaskwarriorProject', () => {
  it('prefers loop override over profile', () => {
    const profile = repoProfileSchema.parse({ taskwarriorProject: 'dxp' })
    expect(resolveTaskwarriorProject('zwook', profile)).toBe('zwook')
  })

  it('throws when no project is configured', () => {
    const profile = repoProfileSchema.parse({})
    expect(() => resolveTaskwarriorProject(undefined, profile)).toThrow(/taskwarriorProject/)
  })
})

import { describe, expect, it } from 'vitest'
import { resolveRepoContext, resolveTaskwarriorProject } from './repoContext.js'
import { repoProfileSchema } from './repoProfile.js'

describe('repoProfileSchema', () => {
  it('defaults taskwarriorProject to dxp', () => {
    expect(repoProfileSchema.parse({}).taskwarriorProject).toBe('dxp')
  })

  it('accepts zwook project', () => {
    expect(repoProfileSchema.parse({ taskwarriorProject: 'zwook' }).taskwarriorProject).toBe(
      'zwook',
    )
  })
})

describe('resolveRepoContext', () => {
  it('uses cwd when repo root omitted', () => {
    const ctx = resolveRepoContext()
    expect(ctx.repoRoot).toBe(process.cwd())
    expect(ctx.profile.taskwarriorProject).toBe('dxp')
  })
})

describe('resolveTaskwarriorProject', () => {
  it('prefers loop override over profile', () => {
    const profile = repoProfileSchema.parse({ taskwarriorProject: 'dxp' })
    expect(resolveTaskwarriorProject('zwook', profile)).toBe('zwook')
  })
})

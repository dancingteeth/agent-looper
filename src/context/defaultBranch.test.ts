import { describe, expect, it } from 'vitest'
import { defaultBranchRefExists, detectDefaultBranch } from './defaultBranch.js'

describe('defaultBranch', () => {
  it('detects a branch that exists in the current repo', () => {
    const branch = detectDefaultBranch(process.cwd())
    expect(['main', 'master']).toContain(branch)
    expect(defaultBranchRefExists(process.cwd(), branch)).toBe(true)
  })

  it('reports missing refs', () => {
    expect(defaultBranchRefExists(process.cwd(), '__not_a_real_branch__')).toBe(false)
  })
})

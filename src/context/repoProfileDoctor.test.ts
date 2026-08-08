import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectDefaultBranch } from './defaultBranch.js'
import { validateRepoProfile } from './repoProfileDoctor.js'
import { repoProfileSchema } from './repoProfile.js'

const tmpRoots: string[] = []

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-profile-doctor-'))
  tmpRoots.push(dir)
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' })
  fs.writeFileSync(path.join(dir, 'README'), 'x\n')
  execFileSync('git', ['add', 'README'], { cwd: dir, stdio: 'ignore' })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' })
  return dir
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('validateRepoProfile', () => {
  it('accepts the current repo default branch', () => {
    const repoRoot = makeGitRepo()
    const check = validateRepoProfile({
      repoRoot,
      profile: repoProfileSchema.parse({
        defaultBranch: detectDefaultBranch(repoRoot),
      }),
    })
    expect(check.ok).toBe(true)
  })

  it('errors when defaultBranch ref is missing', () => {
    const repoRoot = makeGitRepo()
    const check = validateRepoProfile({
      repoRoot,
      profile: repoProfileSchema.parse({ defaultBranch: '__missing_branch__' }),
    })
    expect(check.ok).toBe(false)
    expect(check.errors[0]).toMatch(/defaultBranch/)
  })
})

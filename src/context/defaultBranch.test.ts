import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defaultBranchRefExists, detectDefaultBranch } from './defaultBranch.js'

const tmpRoots: string[] = []

function makeGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-default-branch-'))
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

describe('defaultBranch', () => {
  it('detects a branch that exists in the current repo', () => {
    const repo = makeGitRepo()
    const branch = detectDefaultBranch(repo)
    expect(branch).toBe('main')
    expect(defaultBranchRefExists(repo, branch)).toBe(true)
  })

  it('treats origin/<branch> as an existing default-branch ref', () => {
    const repo = makeGitRepo()
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], {
      cwd: repo,
      stdio: 'ignore',
    })
    execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], {
      cwd: repo,
      stdio: 'ignore',
    })
    // Detached / no local main — still discoverable via origin.
    execFileSync('git', ['checkout', '--detach', 'HEAD'], { cwd: repo, stdio: 'ignore' })
    execFileSync('git', ['branch', '-D', 'main'], { cwd: repo, stdio: 'ignore' })

    expect(detectDefaultBranch(repo)).toBe('main')
    expect(defaultBranchRefExists(repo, 'main')).toBe(true)
  })

  it('reports missing refs', () => {
    const repo = makeGitRepo()
    expect(defaultBranchRefExists(repo, '__not_a_real_branch__')).toBe(false)
  })
})

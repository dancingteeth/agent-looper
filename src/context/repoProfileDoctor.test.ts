import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectDefaultBranch } from './defaultBranch.js'
import { validateRepoProfile } from './repoProfileDoctor.js'
import { repoProfileSchema } from './repoProfile.js'
import { emptyDetection } from '../cli/detectRuntimes.js'
import { CURSOR_LOOP_MODEL, CURSOR_REVIEW_MODEL } from '../loop/loopAgentConfig.js'

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

  it('does not fail frozen costPreset loops when no runtimes are detected', () => {
    const repoRoot = makeGitRepo()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'pinned')
    fs.mkdirSync(loopDir, { recursive: true })
    fs.writeFileSync(
      path.join(loopDir, 'loop.json'),
      JSON.stringify({
        verify: 'true',
        costPreset: 'minmax',
        runtime: 'cursor',
        model: CURSOR_LOOP_MODEL,
        reviewRuntime: 'cursor',
        reviewModel: CURSOR_REVIEW_MODEL,
      }),
    )
    const check = validateRepoProfile(
      {
        repoRoot,
        profile: repoProfileSchema.parse({
          defaultBranch: 'main',
          defaults: { costPreset: 'minmax' },
        }),
      },
      { detection: emptyDetection() },
    )
    expect(check.ok).toBe(true)
    expect(check.warnings.some((warning) => warning.includes('could not parse'))).toBe(false)
  })

  it('parses user-named costPreset loops using profile.costPresets', () => {
    const repoRoot = makeGitRepo()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'sparse')
    fs.mkdirSync(loopDir, { recursive: true })
    fs.writeFileSync(
      path.join(loopDir, 'loop.json'),
      JSON.stringify({ verify: 'true', costPreset: 'cheap-pi' }),
    )
    const check = validateRepoProfile(
      {
        repoRoot,
        profile: repoProfileSchema.parse({
          defaultBranch: 'main',
          costPresets: {
            'cheap-pi': {
              runtime: 'pi',
              model: 'openrouter/deepseek/deepseek-chat',
              reviewRuntime: 'pi',
              reviewModel: 'openrouter/qwen/qwen3-coder-plus',
            },
          },
        }),
      },
      { detection: emptyDetection() },
    )
    expect(check.ok).toBe(true)
    expect(check.warnings.some((warning) => warning.includes('could not parse'))).toBe(false)
  })

  it('surfaces unknown costPreset in the parse warning', () => {
    const repoRoot = makeGitRepo()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'nope')
    fs.mkdirSync(loopDir, { recursive: true })
    fs.writeFileSync(
      path.join(loopDir, 'loop.json'),
      JSON.stringify({ verify: 'true', costPreset: 'nope' }),
    )
    const check = validateRepoProfile(
      {
        repoRoot,
        profile: repoProfileSchema.parse({ defaultBranch: 'main' }),
      },
      { detection: emptyDetection() },
    )
    expect(check.ok).toBe(true)
    expect(check.warnings.some((warning) => warning.includes('unknown costPreset'))).toBe(true)
  })
})

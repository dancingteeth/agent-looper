import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { loadLoopBundle } from './loopConfig.js'

const VALID_GOAL = `# Task

## Goal
Fix the widget.

## Constraints
- Do not disable tests.

## Acceptance criteria
Success is determined only by the verifier in \`loop.json\`, not by your assessment.

## Out of scope
- Deploy to production
`

function writeLoopDir(options?: {
  goal?: string
  loopJson?: Record<string, unknown>
  includeGoal?: boolean
  includeConfig?: boolean
}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-bundle-'))
  if (options?.includeGoal !== false) {
    fs.writeFileSync(path.join(dir, 'GOAL.md'), options?.goal ?? VALID_GOAL, 'utf8')
  }
  if (options?.includeConfig !== false) {
    fs.writeFileSync(
      path.join(dir, 'loop.json'),
      JSON.stringify(options?.loopJson ?? { verify: 'true', delayMs: 0 }),
      'utf8',
    )
  }
  return dir
}

describe('loadLoopBundle', () => {
  it('loads goal, config, and log path from a loop directory', () => {
    const loopDir = writeLoopDir()
    const bundle = loadLoopBundle(loopDir)

    expect(bundle.goal).toContain('Fix the widget')
    expect(bundle.config.verify).toBe('true')
    expect(bundle.logPath).toBe(path.join(loopDir, 'log.ndjson'))
  })

  it('throws when GOAL.md is missing', () => {
    const loopDir = writeLoopDir({ includeGoal: false })
    expect(() => loadLoopBundle(loopDir)).toThrow(/Missing GOAL.md/)
  })

  it('throws when loop.json is missing', () => {
    const loopDir = writeLoopDir({ includeConfig: false })
    expect(() => loadLoopBundle(loopDir)).toThrow(/Missing loop.json/)
  })

  it('throws when GOAL.md is empty', () => {
    const loopDir = writeLoopDir({ goal: '   \n' })
    expect(() => loadLoopBundle(loopDir)).toThrow(/GOAL.md is empty/)
  })

  it('throws when GOAL.md fails preflight', () => {
    const loopDir = writeLoopDir({ goal: '# Goal\nFix things only.\n' })
    expect(() => loadLoopBundle(loopDir)).toThrow(/preflight failed/i)
  })

  it('merges explicit defaults under a sparse loop.json', () => {
    const loopDir = writeLoopDir({ loopJson: { verify: 'true', delayMs: 0 } })
    const bundle = loadLoopBundle(loopDir, { defaults: { runtime: 'dsh', reviewRuntime: 'dsh' } })
    expect(bundle.config.runtime).toBe('dsh')
    expect(bundle.config.reviewRuntime).toBe('dsh')
    expect(bundle.config.verify).toBe('true')
  })

  it('lets loop.json runtime win over defaults', () => {
    const loopDir = writeLoopDir({
      loopJson: { verify: 'true', delayMs: 0, runtime: 'cursor' },
    })
    const bundle = loadLoopBundle(loopDir, { defaults: { runtime: 'dsh' } })
    expect(bundle.config.runtime).toBe('cursor')
  })

  it('discovers profile defaults from a git repo ancestor', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-defaults-repo-'))
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: repoRoot, stdio: 'ignore' })
      const profileDir = path.join(repoRoot, '.cursor')
      fs.mkdirSync(profileDir, { recursive: true })
      fs.writeFileSync(
        path.join(profileDir, 'agent-loop.repo.json'),
        JSON.stringify({ defaultBranch: 'main', defaults: { runtime: 'dsh' } }),
        'utf8',
      )
      const loopDir = path.join(repoRoot, '.cursor', 'loops', 'sparse')
      fs.mkdirSync(loopDir, { recursive: true })
      fs.writeFileSync(path.join(loopDir, 'GOAL.md'), VALID_GOAL, 'utf8')
      fs.writeFileSync(
        path.join(loopDir, 'loop.json'),
        JSON.stringify({ verify: 'true', delayMs: 0 }),
        'utf8',
      )

      const bundle = loadLoopBundle(loopDir)
      expect(bundle.config.runtime).toBe('dsh')
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})

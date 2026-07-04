import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
})

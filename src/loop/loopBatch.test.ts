import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loopBatchConfigSchema,
  parseLoopBatchConfig,
  normalizeBatchLoopEntry,
  runLoopBatch,
} from './loopBatch.js'
import { resolveBatchLoopDir } from './loopBatchPaths.js'
import { repoProfileSchema } from '../context/repoProfile.js'
import { emptyUsageSummary } from '../usage/loopUsage.js'

vi.mock('./agentLoop.js', () => ({
  runAgentLoop: vi.fn(),
}))

import { runAgentLoop } from './agentLoop.js'

const mockedRunAgentLoop = vi.mocked(runAgentLoop)

function passResult(): Awaited<ReturnType<typeof runAgentLoop>> {
  return {
    complete: true,
    status: 'done',
    iterations: 1,
    completionReason: 'Verifier passed',
    lastVerify: {
      complete: true,
      command: 'true',
      exitCode: 0,
      stdout: '',
      stderr: '',
      reason: 'ok',
    },
    logPath: '/tmp/log.ndjson',
    usage: emptyUsageSummary(),
  }
}

describe('loopBatchConfigSchema', () => {
  it('requires at least one loop', () => {
    expect(() => loopBatchConfigSchema.parse({ loops: [] })).toThrow()
  })

  it('defaults syncOnSuccess to true', () => {
    const parsed = loopBatchConfigSchema.parse({ loops: ['affiliate-vitest'] })
    expect(parsed.syncOnSuccess).toBe(true)
  })

  it('accepts legacy syncPostgres alias', () => {
    const parsed = parseLoopBatchConfig({ loops: ['affiliate-vitest'], syncPostgres: false })
    expect(parsed.syncOnSuccess).toBe(false)
  })

  it('accepts hitlCheck', () => {
    const parsed = loopBatchConfigSchema.parse({
      loops: ['affiliate-vitest'],
      hitlCheck: 'Affiliate manual QA',
    })
    expect(parsed.hitlCheck).toBe('Affiliate manual QA')
  })

  it('rejects taskwarriorProject with spaces', () => {
    expect(() =>
      loopBatchConfigSchema.parse({
        loops: ['affiliate-vitest'],
        taskwarriorProject: 'my project',
      }),
    ).toThrow(/spaces/i)
  })

  it('accepts metaLoop instead of loops', () => {
    const parsed = loopBatchConfigSchema.parse({
      metaLoop: { probe: 'system-smoke', fix: 'fix-smoke', maxCycles: 2 },
    })
    expect(parsed.metaLoop?.probe).toBe('system-smoke')
    expect(parsed.metaLoop?.maxCycles).toBe(2)
  })

  it('requires loops or metaLoop', () => {
    expect(() => loopBatchConfigSchema.parse({})).toThrow(/loops|metaLoop/i)
  })

  it('rejects both loops and metaLoop', () => {
    expect(() =>
      loopBatchConfigSchema.parse({
        loops: ['affiliate-vitest'],
        metaLoop: { probe: 'smoke', fix: 'fix-smoke' },
      }),
    ).toThrow(/not both/i)
  })

  it('accepts mixed string and {path,rubric} loop entries', () => {
    const parsed = loopBatchConfigSchema.parse({
      loops: [
        'affiliate-vitest',
        { path: 'other-loop', rubric: 'Keep scope minimal; tests must pass.' },
      ],
    })
    expect(parsed.loops).toEqual([
      'affiliate-vitest',
      { path: 'other-loop', rubric: 'Keep scope minimal; tests must pass.' },
    ])
  })

  it('rejects object entries without rubric', () => {
    expect(() =>
      loopBatchConfigSchema.parse({
        loops: [{ path: 'other-loop' }],
      }),
    ).toThrow()
  })

  it('rejects whitespace-only rubric', () => {
    expect(() =>
      loopBatchConfigSchema.parse({
        loops: [{ path: 'other-loop', rubric: '   \n\t  ' }],
      }),
    ).toThrow()
  })

  it('trims rubric whitespace on parse', () => {
    const parsed = loopBatchConfigSchema.parse({
      loops: [{ path: 'other-loop', rubric: '  Keep docs only.  ' }],
    })
    expect(parsed.loops).toEqual([{ path: 'other-loop', rubric: 'Keep docs only.' }])
  })
})

describe('normalizeBatchLoopEntry', () => {
  it('passes through string paths without rubric', () => {
    expect(normalizeBatchLoopEntry('affiliate-vitest')).toEqual({ path: 'affiliate-vitest' })
  })

  it('extracts path and rubric from object entries', () => {
    expect(
      normalizeBatchLoopEntry({
        path: 'other-loop',
        rubric: 'Focus on docs only.',
      }),
    ).toEqual({ path: 'other-loop', rubric: 'Focus on docs only.' })
  })
})

describe('resolveBatchLoopDir', () => {
  const repoRoot = '/repo'
  const batchDir = '/repo/.cursor/loops/affiliate'

  it('resolves sibling loop dirs under .cursor/loops', () => {
    expect(resolveBatchLoopDir('affiliate-vitest', batchDir, repoRoot)).toBe(
      path.resolve('/repo/.cursor/loops/affiliate-vitest'),
    )
  })

  it('resolves repo-root relative paths', () => {
    expect(resolveBatchLoopDir('.cursor/loops/example-fix', batchDir, repoRoot)).toBe(
      path.resolve('/repo/.cursor/loops/example-fix'),
    )
  })
})

const VALID_GOAL = `# Task

## Goal
Fix the thing under test.

## Constraints
- Do not disable tests.

## Acceptance criteria
Success is determined only by the verifier in \`loop.json\`, not by your assessment.

## Out of scope
- Deploy to production
`

describe('runLoopBatch batchRubric wiring', () => {
  let batchDir: string
  let repoRoot: string

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-batch-rubric-'))
    batchDir = path.join(repoRoot, '.cursor', 'loops', 'test-batch')
    fs.mkdirSync(batchDir, { recursive: true })
    fs.mkdirSync(path.join(repoRoot, '.cursor', 'loops', 'loop-a'), { recursive: true })
    fs.mkdirSync(path.join(repoRoot, '.cursor', 'loops', 'loop-b'), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, '.cursor', 'agent-loop.repo.json'), '{}')
    for (const name of ['loop-a', 'loop-b']) {
      const loopDir = path.join(repoRoot, '.cursor', 'loops', name)
      fs.writeFileSync(path.join(loopDir, 'GOAL.md'), VALID_GOAL)
      fs.writeFileSync(
        path.join(loopDir, 'loop.json'),
        JSON.stringify({ verify: 'true', maxIterations: 1 }),
      )
    }
    fs.writeFileSync(
      path.join(batchDir, 'loop-batch.json'),
      JSON.stringify({
        loops: [
          'loop-a',
          { path: 'loop-b', rubric: 'Docs-only slice; no runtime deps.' },
        ],
        syncOnSuccess: false,
      }),
    )
    mockedRunAgentLoop.mockReset()
    mockedRunAgentLoop.mockResolvedValue(passResult())
  })

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true })
  })

  it('passes batchRubric into runAgentLoop for object entries only', async () => {
    const ctx = {
      repoRoot,
      profile: repoProfileSchema.parse({}),
    }
    await runLoopBatch({ ctx, batchDir, skipSync: true })

    expect(mockedRunAgentLoop).toHaveBeenCalledTimes(2)
    expect(mockedRunAgentLoop.mock.calls[0]![0]).not.toHaveProperty('batchRubric')
    expect(mockedRunAgentLoop.mock.calls[1]![0]).toMatchObject({
      batchRubric: 'Docs-only slice; no runtime deps.',
    })
  })
})

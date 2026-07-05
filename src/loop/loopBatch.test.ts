import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loopBatchConfigSchema,
  parseLoopBatchConfig,
} from './loopBatch.js'
import { resolveBatchLoopDir } from './loopBatchPaths.js'

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

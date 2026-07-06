import { describe, expect, it } from 'vitest'
import { migrateLegacySyncPostgres } from './loopConfigLegacy.js'
import { parseLoopBatchConfig } from './loopBatch.js'
import { parseLoopConfig } from './loopConfig.js'

describe('migrateLegacySyncPostgres', () => {
  it('rewrites syncPostgres to syncOnSuccess for loop config', () => {
    const parsed = parseLoopConfig(migrateLegacySyncPostgres({ verify: 'true', syncPostgres: false }))
    expect(parsed.syncOnSuccess).toBe(false)
  })

  it('rewrites syncPostgres to syncOnSuccess for batch config', () => {
    const parsed = parseLoopBatchConfig(
      migrateLegacySyncPostgres({ loops: ['affiliate-vitest'], syncPostgres: false }),
    )
    expect(parsed.syncOnSuccess).toBe(false)
  })

  it('leaves raw config unchanged when syncOnSuccess is already set', () => {
    const raw = { verify: 'true', syncPostgres: false, syncOnSuccess: true }
    expect(migrateLegacySyncPostgres(raw)).toEqual(raw)
  })
})

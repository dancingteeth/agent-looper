import { describe, expect, it } from 'vitest'
import { ensureInkProductionEnv } from './inkProductionEnv.js'

describe('ensureInkProductionEnv', () => {
  it('sets production only when NODE_ENV is missing', () => {
    const unset: { NODE_ENV?: string } = {}
    ensureInkProductionEnv(unset)
    expect(unset.NODE_ENV).toBe('production')

    const empty = { NODE_ENV: '' }
    ensureInkProductionEnv(empty)
    expect(empty.NODE_ENV).toBe('production')
  })

  it('leaves an explicit NODE_ENV alone', () => {
    const development = { NODE_ENV: 'development' }
    ensureInkProductionEnv(development)
    expect(development.NODE_ENV).toBe('development')

    const testEnv = { NODE_ENV: 'test' }
    ensureInkProductionEnv(testEnv)
    expect(testEnv.NODE_ENV).toBe('test')
  })
})

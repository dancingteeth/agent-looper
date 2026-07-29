import { describe, expect, it } from 'vitest'
import { parseRunBatchArgs, runBatchUsage } from './runBatchArgs.js'

describe('parseRunBatchArgs', () => {
  it('parses a bare batch dir with defaults', () => {
    const result = parseRunBatchArgs(['.cursor/loops/batch'])
    if (result.kind !== 'run') throw new Error('expected run')
    expect(result.options.batchDir).toBe('.cursor/loops/batch')
    expect(result.options.skipSync).toBe(false)
    expect(result.options.requireTrustConfig).toBe(false)
    expect(result.options.notifyTelegram).toBeUndefined()
  })

  it('parses boolean flags', () => {
    const result = parseRunBatchArgs([
      'batch',
      '--skip-sync',
      '--no-telegram',
      '--trust-config',
      '--require-trust-config',
    ])
    if (result.kind !== 'run') throw new Error('expected run')
    expect(result.options).toMatchObject({
      skipSync: true,
      notifyTelegram: false,
      trustConfig: true,
      requireTrustConfig: true,
    })
  })

  it('captures --repo-root and verbose', () => {
    const result = parseRunBatchArgs(['batch', '--repo-root', '/tmp/r', '-v'])
    if (result.kind !== 'run') throw new Error('expected run')
    expect(result.options.repoRoot).toBe('/tmp/r')
    expect(result.options.verbose).toBe(true)
  })

  it('returns help for --help and -h', () => {
    for (const flag of ['--help', '-h']) {
      expect(parseRunBatchArgs([flag])).toEqual({ kind: 'help', text: runBatchUsage() })
    }
  })

  it('errors with usage when no batch dir is given', () => {
    expect(parseRunBatchArgs([])).toEqual({ kind: 'error', message: runBatchUsage() })
  })
})

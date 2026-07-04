import { describe, expect, it } from 'vitest'
import { detectStagnation, failureFingerprint } from './loopStagnation.js'
import type { VerifyResult } from './loopVerify.js'

function fail(stdout: string, command = 'pnpm exec vitest run foo.test.ts'): VerifyResult {
  return {
    complete: false,
    command,
    exitCode: 1,
    stdout,
    stderr: '',
    reason: 'Verifier failed (exit 1).',
  }
}

describe('failureFingerprint', () => {
  it('matches identical failures', () => {
    const a = fail('FAIL src/a.test.ts\nExpected 1 got 2')
    const b = fail('FAIL src/a.test.ts\nExpected 1 got 2')
    expect(failureFingerprint(a)).toBe(failureFingerprint(b))
  })

  it('differs when output changes', () => {
    const a = fail('FAIL src/a.test.ts')
    const b = fail('FAIL src/b.test.ts')
    expect(failureFingerprint(a)).not.toBe(failureFingerprint(b))
  })
})

describe('detectStagnation', () => {
  it('is not stagnant below threshold', () => {
    const failures = [fail('FAIL a'), fail('FAIL a')]
    expect(detectStagnation(failures, 3).stagnant).toBe(false)
  })

  it('detects three identical failures', () => {
    const failures = [fail('FAIL same'), fail('FAIL same'), fail('FAIL same')]
    const check = detectStagnation(failures, 3)
    expect(check.stagnant).toBe(true)
    expect(check.repeatCount).toBe(3)
  })

  it('is not stagnant when the latest failure differs', () => {
    const failures = [fail('FAIL a'), fail('FAIL a'), fail('FAIL b')]
    expect(detectStagnation(failures, 3).stagnant).toBe(false)
  })

  it('threshold 0 disables stagnation', () => {
    const failures = [fail('x'), fail('x'), fail('x')]
    expect(detectStagnation(failures, 0).stagnant).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { deriveLoopRunStatus, resolveLoopCliExitCode } from './agentLoop.js'

describe('deriveLoopRunStatus', () => {
  it('maps complete to done', () => {
    expect(deriveLoopRunStatus({ complete: true })).toBe('done')
  })

  it('maps HITL escalate to waiting', () => {
    expect(
      deriveLoopRunStatus({ complete: false, reviewEscalatedToHitl: true }),
    ).toBe('waiting')
  })

  it('maps env-class lastVerify to waiting', () => {
    expect(
      deriveLoopRunStatus({
        complete: false,
        lastVerify: {
          complete: false,
          command: 'bash verify.sh',
          exitCode: 75,
          stdout: '',
          stderr: '',
          reason: 'Verifier failed (exit 75).',
        },
      }),
    ).toBe('waiting')
  })

  it('maps failed setup to waiting', () => {
    expect(
      deriveLoopRunStatus({
        complete: false,
        setup: {
          complete: false,
          command: 'bash setup.sh',
          exitCode: 1,
          stdout: '',
          stderr: '',
          reason: 'Setup failed (exit 1).',
          verifyClass: 'env',
        },
      }),
    ).toBe('waiting')
  })

  it('keeps an explicit waiting status (budget)', () => {
    expect(deriveLoopRunStatus({ complete: false, status: 'waiting' })).toBe('waiting')
  })

  it('maps other incomplete to continue', () => {
    expect(deriveLoopRunStatus({ complete: false })).toBe('continue')
  })
})

describe('resolveLoopCliExitCode', () => {
  it('returns 0 for complete runs', () => {
    expect(resolveLoopCliExitCode({ complete: true, status: 'done' })).toBe(0)
  })

  it('returns 0 for waiting parks', () => {
    expect(resolveLoopCliExitCode({ complete: false, status: 'waiting' })).toBe(0)
  })

  it('returns 2 for continue incomplete runs', () => {
    expect(resolveLoopCliExitCode({ complete: false, status: 'continue' })).toBe(2)
  })
})

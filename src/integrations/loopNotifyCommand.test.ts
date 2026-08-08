import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveNotifyCommand, runLoopNotifyCommand } from './loopNotifyCommand.js'

const { execFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync,
}))

afterEach(() => {
  vi.clearAllMocks()
})

describe('resolveNotifyCommand', () => {
  it('prefers loop override over profile', () => {
    expect(
      resolveNotifyCommand({
        profileCommand: 'echo profile',
        loopCommand: 'echo loop',
      }),
    ).toBe('echo loop')
  })

  it('returns undefined when disabled', () => {
    expect(
      resolveNotifyCommand({
        profileCommand: 'echo x',
        disabled: true,
      }),
    ).toBeUndefined()
  })
})

describe('runLoopNotifyCommand', () => {
  it('passes LOOP_* env and returns true on success', () => {
    execFileSync.mockReturnValue('ok\n')
    const ok = runLoopNotifyCommand({
      repoRoot: '/tmp/repo',
      command: 'curl -sS "$SLACK_WEBHOOK"',
      kind: 'loop',
      bundle: '.cursor/loops/x',
      complete: false,
      exitCode: 2,
      reason: 'fetch failed',
      report: 'status incomplete',
      iterations: 1,
    })
    expect(ok).toBe(true)
    expect(execFileSync).toHaveBeenCalledWith(
      'curl -sS "$SLACK_WEBHOOK"',
      expect.objectContaining({
        cwd: '/tmp/repo',
        shell: true,
        timeout: 15_000,
        env: expect.objectContaining({
          LOOP_KIND: 'loop',
          LOOP_BUNDLE: '.cursor/loops/x',
          LOOP_COMPLETE: '0',
          LOOP_EXIT_CODE: '2',
          LOOP_REASON: 'fetch failed',
          LOOP_REPORT: 'status incomplete',
          LOOP_ITERATIONS: '1',
          LOOP_EXPORT_PACK: '',
        }),
      }),
    )
  })

  it('returns false when the command throws', () => {
    execFileSync.mockImplementation(() => {
      throw new Error('boom')
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      runLoopNotifyCommand({
        repoRoot: '/tmp/repo',
        command: 'false',
        kind: 'batch',
        bundle: 'batch',
        complete: true,
        exitCode: 0,
        reason: 'ok',
      }),
    ).toBe(false)
    errSpy.mockRestore()
  })
})

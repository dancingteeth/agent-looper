import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LOOP_COMPLETION_SIGNAL_PREFIX,
  LOOP_NO_COMPLETION_SIGNAL_ENV,
  completionSignalDisabled,
  emitLoopCompletionSignal,
  exitWithLoopCompletionSignal,
  formatLoopCompletionSignalLine,
  runReportRelativePath,
  runReportSignalPath,
  shouldEmitLoopCompletionSignal,
} from './loopCompletionSignal.js'

afterEach(() => {
  delete process.env[LOOP_NO_COMPLETION_SIGNAL_ENV]
  vi.restoreAllMocks()
})

describe('loopCompletionSignal', () => {
  it('formats a single-line JSON sentinel', () => {
    const line = formatLoopCompletionSignalLine({
      v: 1,
      kind: 'loop',
      bundle: '.cursor/loops/foo',
      complete: true,
      exitCode: 0,
      reason: 'Verifier passed',
      iterations: 2,
    })
    expect(line.startsWith(`${LOOP_COMPLETION_SIGNAL_PREFIX} `)).toBe(true)
    const json = JSON.parse(line.slice(LOOP_COMPLETION_SIGNAL_PREFIX.length + 1))
    expect(json.kind).toBe('loop')
    expect(json.exitCode).toBe(0)
  })

  it('respects env opt-out', () => {
    process.env[LOOP_NO_COMPLETION_SIGNAL_ENV] = '1'
    expect(completionSignalDisabled()).toBe(true)
    expect(shouldEmitLoopCompletionSignal({ completionSignal: true })).toBe(false)
  })

  it('writes synchronously to fd 1 (survives process.exit after pipes)', () => {
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation(() => 0)
    emitLoopCompletionSignal({
      v: 1,
      kind: 'batch',
      bundle: '.cursor/loops/batch',
      complete: false,
      exitCode: 2,
      reason: 'loop 1 failed',
      loopsRun: 1,
    })
    expect(writeSync).toHaveBeenCalledWith(
      1,
      expect.stringMatching(new RegExp(`^${LOOP_COMPLETION_SIGNAL_PREFIX} `)),
    )
    const written = String(writeSync.mock.calls[0]?.[1] ?? '')
    expect(written.endsWith('\n')).toBe(true)
  })

  it('runReportSignalPath omits missing files', () => {
    expect(
      runReportSignalPath({
        loopDir: '/tmp/no-such-loop-bundle-xyz',
        repoRoot: '/tmp',
        include: true,
      }),
    ).toBeUndefined()
    expect(
      runReportSignalPath({
        loopDir: '/tmp/x',
        repoRoot: '/tmp',
        include: false,
      }),
    ).toBeUndefined()
  })

  it('runReportRelativePath is stable under path.join', () => {
    expect(runReportRelativePath('/repo/.cursor/loops/foo', '/repo')).toBe(
      '.cursor/loops/foo/run-report.md',
    )
  })

  it('exitWithLoopCompletionSignal optionally emits then exits', () => {
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation(() => 0)
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as typeof process.exit)

    expect(() =>
      exitWithLoopCompletionSignal({
        emit: true,
        exitCode: 0,
        payload: {
          v: 1,
          kind: 'loop',
          bundle: '.cursor/loops/foo',
          complete: true,
          exitCode: 0,
          reason: 'done',
        },
      }),
    ).toThrow('exit')
    expect(writeSync).toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(0)

    writeSync.mockClear()
    expect(() =>
      exitWithLoopCompletionSignal({
        emit: false,
        exitCode: 1,
        payload: {
          v: 1,
          kind: 'loop',
          bundle: '.cursor/loops/foo',
          complete: false,
          exitCode: 1,
          reason: 'fail',
        },
      }),
    ).toThrow('exit')
    expect(writeSync).not.toHaveBeenCalled()
    expect(exit).toHaveBeenCalledWith(1)
  })
})

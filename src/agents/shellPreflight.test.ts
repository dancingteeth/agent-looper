import { execFile } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: vi.fn(actual.execFile),
  }
})

import { assertPosixShell } from './shellPreflight.js'

const mockedExecFile = vi.mocked(execFile)

describe('assertPosixShell', () => {
  beforeEach(() => {
    mockedExecFile.mockReset()
  })

  it('resolves when sh echoes the probe string', async () => {
    mockedExecFile.mockImplementation((_file, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      callback?.(null, { stdout: 'agent-loop-shell-ok\n', stderr: '' } as never, '' as never)
      return {} as never
    })

    await expect(assertPosixShell()).resolves.toBeUndefined()
    expect(mockedExecFile).toHaveBeenCalledWith(
      'sh',
      ['-c', 'echo agent-loop-shell-ok'],
      expect.objectContaining({ encoding: 'utf8' }),
      expect.any(Function),
    )
  })

  it('throws a clear error when sh is unavailable', async () => {
    mockedExecFile.mockImplementation((_file, _args, _opts, cb) => {
      const callback = typeof _opts === 'function' ? _opts : cb
      callback?.(new Error('ENOENT'), '' as never, '' as never)
      return {} as never
    })

    await expect(assertPosixShell()).rejects.toThrow(/Shell preflight failed/)
  })
})

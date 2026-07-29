import { describe, expect, it, vi } from 'vitest'
import { CursorRunTimeoutError, waitForCursorRun } from './cursorAgent.js'

describe('waitForCursorRun', () => {
  it('resolves with the run result before the timeout', async () => {
    const onTimeout = vi.fn()
    await expect(waitForCursorRun(Promise.resolve('done'), 1000, onTimeout)).resolves.toBe('done')
    expect(onTimeout).not.toHaveBeenCalled()
  })

  it('rejects with CursorRunTimeoutError and fires onTimeout (remote cancel hook)', async () => {
    const onTimeout = vi.fn().mockResolvedValue(undefined)
    const never = new Promise(() => {})
    await expect(waitForCursorRun(never, 5, onTimeout)).rejects.toBeInstanceOf(
      CursorRunTimeoutError,
    )
    expect(onTimeout).toHaveBeenCalledTimes(1)
  })

  it('still rejects with the timeout error when the cancel hook throws', async () => {
    const onTimeout = vi.fn().mockRejectedValue(new Error('cancel failed'))
    const never = new Promise(() => {})
    await expect(waitForCursorRun(never, 5, onTimeout)).rejects.toBeInstanceOf(
      CursorRunTimeoutError,
    )
  })

  it('passes through non-timeout rejections without calling onTimeout', async () => {
    const onTimeout = vi.fn()
    await expect(waitForCursorRun(Promise.reject(new Error('boom')), 1000, onTimeout)).rejects.toThrow(
      'boom',
    )
    expect(onTimeout).not.toHaveBeenCalled()
  })
})

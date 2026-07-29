import { describe, expect, it, vi } from 'vitest'
import {
  AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV,
  CursorRunTimeoutError,
  resolveCursorSessionTimeoutMs,
  waitForCursorRun,
} from './cursorAgent.js'

describe('resolveCursorSessionTimeoutMs', () => {
  it('defaults to 45 minutes when unset', () => {
    expect(resolveCursorSessionTimeoutMs({})).toBe(45 * 60 * 1000)
  })

  it('parses a positive override from env', () => {
    expect(
      resolveCursorSessionTimeoutMs({ [AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV]: '120000' }),
    ).toBe(120000)
  })

  it('rejects zero, negative, and non-numeric values', () => {
    expect(() =>
      resolveCursorSessionTimeoutMs({ [AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV]: '0' }),
    ).toThrow(/positive number/)
    expect(() =>
      resolveCursorSessionTimeoutMs({ [AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV]: '-1' }),
    ).toThrow(/positive number/)
    expect(() =>
      resolveCursorSessionTimeoutMs({ [AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV]: 'nope' }),
    ).toThrow(/positive number/)
  })
})

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

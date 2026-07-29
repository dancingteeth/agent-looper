import { afterEach, describe, expect, it, vi } from 'vitest'

const question = vi.fn().mockResolvedValue('')
const close = vi.fn()

vi.mock('node:readline/promises', () => ({
  default: {
    createInterface: vi.fn(() => ({ question, close })),
  },
}))

import { pauseForContinue } from './loopPause.js'

describe('pauseForContinue', () => {
  afterEach(() => {
    question.mockClear()
    close.mockClear()
    vi.restoreAllMocks()
  })

  it('skips the prompt when stdin is not a TTY', async () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: false })

    await pauseForContinue(2, 5)

    expect(question).not.toHaveBeenCalled()
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('pause skipped'))).toBe(true)
  })

  it('prompts and closes readline when stdin is a TTY', async () => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true })

    await pauseForContinue(1, 3)

    expect(question).toHaveBeenCalledWith(
      expect.stringContaining('iteration 1/3 complete'),
    )
    expect(close).toHaveBeenCalled()
  })
})

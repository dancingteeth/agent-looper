import { describe, expect, it } from 'vitest'
import { runVerifyCommand } from './loopVerify.js'

describe('runVerifyCommand', () => {
  it('treats exit 0 as complete', () => {
    const result = runVerifyCommand('true', process.cwd())
    expect(result.complete).toBe(true)
    expect(result.exitCode).toBe(0)
  })

  it('treats non-zero exit as incomplete', () => {
    const result = runVerifyCommand('false', process.cwd())
    expect(result.complete).toBe(false)
    expect(result.exitCode).toBe(1)
  })
})

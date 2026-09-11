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
    expect(result.verifyClass).toBe('product')
  })

  it('classifies exit 75 as env', () => {
    const result = runVerifyCommand('sh -c "exit 75"', process.cwd())
    expect(result.complete).toBe(false)
    expect(result.exitCode).toBe(75)
    expect(result.verifyClass).toBe('env')
  })

  it('classifies exit 127 as env', () => {
    const result = runVerifyCommand('sh -c "exit 127"', process.cwd())
    expect(result.complete).toBe(false)
    expect(result.exitCode).toBe(127)
    expect(result.verifyClass).toBe('env')
  })

  it('keeps exit 0 when output exceeds the 64KB capture cap', () => {
    const result = runVerifyCommand(
      "awk 'BEGIN { for (i = 0; i < 80000; i++) printf \"x\" }'",
      process.cwd(),
    )
    expect(result.complete).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.length).toBeGreaterThan(64 * 1024)
    expect(result.stdout).toContain('…(truncated)')
  })
})

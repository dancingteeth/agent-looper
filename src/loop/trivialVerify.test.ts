import { describe, expect, it } from 'vitest'
import { isTrivialVerifyCommand, trivialVerifyWarning } from './trivialVerify.js'

describe('isTrivialVerifyCommand', () => {
  it('flags common placeholders', () => {
    expect(isTrivialVerifyCommand('true')).toBe(true)
    expect(isTrivialVerifyCommand('  TRUE  ')).toBe(true)
    expect(isTrivialVerifyCommand('exit 0')).toBe(true)
    expect(isTrivialVerifyCommand('/bin/true')).toBe(true)
    expect(isTrivialVerifyCommand('echo ok')).toBe(true)
  })

  it('allows real verify commands', () => {
    expect(isTrivialVerifyCommand('bash .cursor/loops/x/verify.sh')).toBe(false)
    expect(isTrivialVerifyCommand('pnpm vitest run src/foo.test.ts')).toBe(false)
    expect(isTrivialVerifyCommand('true && pnpm test')).toBe(false)
  })

  it('formats a doctor-friendly warning', () => {
    expect(trivialVerifyWarning('loop.json', 'true')).toMatch(/trivial/)
    expect(trivialVerifyWarning('loop.json', 'true')).toMatch(/verify\.sh/)
  })
})

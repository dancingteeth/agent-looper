import { describe, expect, it } from 'vitest'
import {
  attachVerifyClass,
  classifyVerifyClass,
  isEnvVerifyFailure,
  VERIFY_CLASS_ENV,
  VERIFY_CLASS_OK,
  VERIFY_CLASS_PRODUCT,
  VERIFY_COMMAND_NOT_FOUND_EXIT_CODE,
  VERIFY_ENV_EXIT_CODE,
} from './verifyClass.js'

describe('classifyVerifyClass', () => {
  it('marks exit 0 as ok', () => {
    expect(
      classifyVerifyClass({
        complete: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        reason: 'Verifier passed (exit 0).',
      }),
    ).toBe(VERIFY_CLASS_OK)
  })

  it('marks exit 75 as env', () => {
    expect(
      classifyVerifyClass({
        complete: false,
        exitCode: VERIFY_ENV_EXIT_CODE,
        stdout: '',
        stderr: 'pnpm: command not found',
        reason: `Verifier failed (exit ${VERIFY_ENV_EXIT_CODE}).`,
      }),
    ).toBe(VERIFY_CLASS_ENV)
  })

  it('marks VERIFY_CLASS=env in output as env even on exit 1', () => {
    expect(
      classifyVerifyClass({
        complete: false,
        exitCode: 1,
        stdout: 'VERIFY_CLASS=env missing node\n',
        stderr: '',
        reason: 'Verifier failed (exit 1).',
      }),
    ).toBe(VERIFY_CLASS_ENV)
  })

  it('marks exit 127 as env', () => {
    expect(
      classifyVerifyClass({
        complete: false,
        exitCode: VERIFY_COMMAND_NOT_FOUND_EXIT_CODE,
        stdout: '',
        stderr: 'pnpm: command not found',
        reason: `Verifier failed (exit ${VERIFY_COMMAND_NOT_FOUND_EXIT_CODE}).`,
      }),
    ).toBe(VERIFY_CLASS_ENV)
  })

  it('marks spawn ENOENT as env', () => {
    expect(
      classifyVerifyClass({
        complete: false,
        exitCode: null,
        stdout: '',
        stderr: '',
        reason: 'Verifier error: spawnSync ENOENT',
      }),
    ).toBe(VERIFY_CLASS_ENV)
  })

  it('marks ordinary non-zero as product', () => {
    expect(
      classifyVerifyClass({
        complete: false,
        exitCode: 1,
        stdout: 'FAIL src/foo.test.ts',
        stderr: '',
        reason: 'Verifier failed (exit 1).',
      }),
    ).toBe(VERIFY_CLASS_PRODUCT)
  })
})

describe('attachVerifyClass / isEnvVerifyFailure', () => {
  it('fills verifyClass when missing', () => {
    const attached = attachVerifyClass({
      complete: false,
      command: 'false',
      exitCode: 1,
      stdout: '',
      stderr: '',
      reason: 'Verifier failed (exit 1).',
    })
    expect(attached.verifyClass).toBe(VERIFY_CLASS_PRODUCT)
    expect(isEnvVerifyFailure(attached)).toBe(false)
  })

  it('keeps an explicit verifyClass', () => {
    const attached = attachVerifyClass({
      complete: false,
      command: 'true',
      exitCode: 1,
      stdout: '',
      stderr: '',
      reason: 'x',
      verifyClass: VERIFY_CLASS_ENV,
    })
    expect(attached.verifyClass).toBe(VERIFY_CLASS_ENV)
    expect(isEnvVerifyFailure(attached)).toBe(true)
  })
})

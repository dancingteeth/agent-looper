/** sysexits.h `EX_TEMPFAIL` — environment limitation, not a product failure. */
export const VERIFY_ENV_EXIT_CODE = 75

/** POSIX "command not found" — missing toolchain on PATH, not a product failure. */
export const VERIFY_COMMAND_NOT_FOUND_EXIT_CODE = 127

/** Line the verifier may print to force env classification (any non-zero exit). */
export const VERIFY_CLASS_ENV_MARKER = 'VERIFY_CLASS=env'

export const VERIFY_CLASS_OK = 'ok' as const
export const VERIFY_CLASS_PRODUCT = 'product' as const
export const VERIFY_CLASS_ENV = 'env' as const

export type VerifyClass = typeof VERIFY_CLASS_OK | typeof VERIFY_CLASS_PRODUCT | typeof VERIFY_CLASS_ENV

export type VerifyClassifiable = {
  complete: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  reason: string
  verifyClass?: VerifyClass
}

const ENV_MARKER_RE = /^VERIFY_CLASS=env\b/m

export function classifyVerifyClass(result: VerifyClassifiable): VerifyClass {
  if (result.complete || result.exitCode === 0) return VERIFY_CLASS_OK
  if (
    result.exitCode === VERIFY_ENV_EXIT_CODE ||
    result.exitCode === VERIFY_COMMAND_NOT_FOUND_EXIT_CODE
  ) {
    return VERIFY_CLASS_ENV
  }
  const output = `${result.stdout}\n${result.stderr}`
  if (ENV_MARKER_RE.test(output)) return VERIFY_CLASS_ENV
  if (/ENOENT/i.test(result.reason) && /Verifier error:/i.test(result.reason)) {
    return VERIFY_CLASS_ENV
  }
  return VERIFY_CLASS_PRODUCT
}

export function attachVerifyClass<T extends VerifyClassifiable>(result: T): T & { verifyClass: VerifyClass } {
  return {
    ...result,
    verifyClass: result.verifyClass ?? classifyVerifyClass(result),
  }
}

export function isEnvVerifyFailure(result: VerifyClassifiable | null | undefined): boolean {
  if (!result || result.complete) return false
  return (result.verifyClass ?? classifyVerifyClass(result)) === VERIFY_CLASS_ENV
}

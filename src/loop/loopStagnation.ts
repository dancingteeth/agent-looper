import type { VerifyResult } from './loopVerify.js'

export const DEFAULT_STAGNATION_THRESHOLD = 3

export function failureFingerprint(result: VerifyResult): string {
  const output = `${result.stdout}\n${result.stderr}`.replace(/\s+/g, ' ').trim()
  const tail = output.length > 600 ? output.slice(-600) : output
  return `${result.command}|${result.exitCode ?? 'null'}|${tail}`
}

export type StagnationCheck = {
  stagnant: boolean
  fingerprint: string
  repeatCount: number
  threshold: number
}

export function detectStagnation(
  failures: VerifyResult[],
  threshold = DEFAULT_STAGNATION_THRESHOLD,
): StagnationCheck {
  if (threshold <= 0 || failures.length < threshold) {
    return {
      stagnant: false,
      fingerprint: failures.length ? failureFingerprint(failures[failures.length - 1]!) : '',
      repeatCount: failures.length,
      threshold,
    }
  }

  const recent = failures.slice(-threshold)
  const fingerprint = failureFingerprint(recent[recent.length - 1]!)
  const allSame = recent.every((f) => failureFingerprint(f) === fingerprint)

  return {
    stagnant: allSame,
    fingerprint,
    repeatCount: recent.length,
    threshold,
  }
}

import type { VerifyResult } from './loopVerify.js'

export const DEFAULT_STAGNATION_THRESHOLD = 3

const FINGERPRINT_SEGMENT = 300

export function failureFingerprint(result: VerifyResult): string {
  const output = `${result.stdout}\n${result.stderr}`.replace(/\s+/g, ' ').trim()
  let signature = output
  if (output.length > FINGERPRINT_SEGMENT * 2) {
    signature = `${output.slice(0, FINGERPRINT_SEGMENT)}…${output.slice(-FINGERPRINT_SEGMENT)}`
  }
  return `${result.command}|${result.exitCode ?? 'null'}|${signature}`
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

import { spawnSync } from 'node:child_process'

export type VerifyResult = {
  complete: boolean
  command: string
  exitCode: number | null
  stdout: string
  stderr: string
  reason: string
}

const MAX_CAPTURE = 64 * 1024
/** spawnSync kills the child on overflow; keep this well above typical test logs. */
const MAX_SPAWN_BUFFER = 1024 * 1024

function truncate(text: string, max = MAX_CAPTURE): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…(truncated)`
}

export function runVerifyCommand(command: string, cwd: string): VerifyResult {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: MAX_SPAWN_BUFFER,
    env: process.env,
  })

  const stdout = truncate(result.stdout ?? '')
  const stderr = truncate(result.stderr ?? '')
  const exitCode = result.status
  const complete = exitCode === 0

  let reason = complete ? 'Verifier passed (exit 0).' : `Verifier failed (exit ${exitCode ?? 'null'}).`
  if (result.error) {
    reason = `Verifier error: ${result.error.message}`
  }

  return {
    complete,
    command,
    exitCode,
    stdout,
    stderr,
    reason,
  }
}

import fs from 'node:fs'
import path from 'node:path'

/** Cursor / IDE agents can watch stdout for this prefix (see README — background runs). */
export const LOOP_COMPLETION_SIGNAL_PREFIX = 'AGENT_LOOP_DONE'

export const LOOP_NO_COMPLETION_SIGNAL_ENV = 'AGENT_LOOP_NO_COMPLETION_SIGNAL'

export type LoopCompletionSignalKind = 'loop' | 'batch'

export type LoopCompletionSignalPayload = {
  v: 1
  kind: LoopCompletionSignalKind
  /** Bundle or batch path relative to repo root when known. */
  bundle: string
  complete: boolean
  exitCode: 0 | 1 | 2
  reason: string
  iterations?: number
  loopsRun?: number
  hitl?: string
  /** Relative path to run-report.md when the file exists. */
  runReport?: string
}

export function completionSignalDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[LOOP_NO_COMPLETION_SIGNAL_ENV]?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function shouldEmitLoopCompletionSignal(input: {
  completionSignal?: boolean
  env?: NodeJS.ProcessEnv
}): boolean {
  if (completionSignalDisabled(input.env)) return false
  return input.completionSignal !== false
}

export function formatLoopCompletionSignalLine(payload: LoopCompletionSignalPayload): string {
  return `${LOOP_COMPLETION_SIGNAL_PREFIX} ${JSON.stringify(payload)}`
}

/**
 * One-line machine-readable completion event on stdout (fd 1).
 * Uses writeSync so piped stdout (Cursor background shells) is flushed before process.exit.
 * Pair with Shell `notify_on_output` pattern `^AGENT_LOOP_DONE `.
 */
export function emitLoopCompletionSignal(payload: LoopCompletionSignalPayload): void {
  fs.writeSync(1, `${formatLoopCompletionSignalLine(payload)}\n`)
}

/** Emit optional signal then exit — shared by agent-loop / agent-loop-batch CLIs. */
export function exitWithLoopCompletionSignal(input: {
  emit: boolean
  payload: LoopCompletionSignalPayload
  exitCode: 0 | 1 | 2
}): never {
  if (input.emit) {
    emitLoopCompletionSignal(input.payload)
  }
  process.exit(input.exitCode)
}

export function runReportRelativePath(loopDir: string, repoRoot: string): string {
  return path.relative(repoRoot, path.join(loopDir, 'run-report.md'))
}

/** Include runReport in the signal only when the artifact is on disk. */
export function runReportSignalPath(input: {
  loopDir: string
  repoRoot: string
  include: boolean
}): string | undefined {
  if (!input.include) return undefined
  const abs = path.join(input.loopDir, 'run-report.md')
  if (!fs.existsSync(abs)) return undefined
  return runReportRelativePath(input.loopDir, input.repoRoot)
}

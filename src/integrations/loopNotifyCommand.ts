import { execFileSync } from 'node:child_process'

export type LoopNotifyCommandKind = 'loop' | 'batch'

/** Cap shell notify so a hung hook cannot block CLI exit after AGENT_LOOP_DONE. */
export const NOTIFY_COMMAND_TIMEOUT_MS = 15_000

export type RunLoopNotifyCommandInput = {
  repoRoot: string
  command: string
  kind: LoopNotifyCommandKind
  bundle: string
  complete: boolean
  exitCode: 0 | 1 | 2
  reason: string
  /** Short report body (same shape as Telegram completion text when available). */
  report?: string
  iterations?: number
  loopsRun?: number
  hitl?: string
  /** Relative path to in-loop run-report.md when present. */
  runReport?: string
  /** Relative path(s) to export pack dir(s), comma-separated for batch. */
  exportPack?: string
  timeoutMs?: number
}

/**
 * Optional shell hook after a loop/batch finishes (success, incomplete, or fatal).
 * Non-blocking on failure. Prefer this for Slack/Discord/webhooks when Telegram
 * is unavailable — especially Cloud Agents (no Shell notify_on_output).
 */
export function runLoopNotifyCommand(input: RunLoopNotifyCommandInput): boolean {
  try {
    console.error(`[agent-loop] notifyCommand (${input.command})`)
    const output = execFileSync(input.command, {
      cwd: input.repoRoot,
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: input.timeoutMs ?? NOTIFY_COMMAND_TIMEOUT_MS,
      env: {
        ...process.env,
        LOOP_KIND: input.kind,
        LOOP_BUNDLE: input.bundle,
        LOOP_COMPLETE: input.complete ? '1' : '0',
        LOOP_EXIT_CODE: String(input.exitCode),
        LOOP_REASON: input.reason,
        LOOP_REPORT: input.report ?? '',
        LOOP_ITERATIONS: input.iterations !== undefined ? String(input.iterations) : '',
        LOOP_LOOPS_RUN: input.loopsRun !== undefined ? String(input.loopsRun) : '',
        LOOP_HITL: input.hitl ?? '',
        LOOP_RUN_REPORT: input.runReport ?? '',
        LOOP_EXPORT_PACK: input.exportPack ?? '',
      },
      maxBuffer: 1024 * 1024,
    })
    const line = output.trim().split('\n').filter(Boolean).pop()
    if (line) console.error(`[agent-loop] notifyCommand: ${line}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: notifyCommand failed (non-blocking): ${message}`)
    return false
  }
}

export function resolveNotifyCommand(input: {
  profileCommand?: string | null
  loopCommand?: string | null
  disabled?: boolean
}): string | undefined {
  if (input.disabled) return undefined
  const fromLoop = input.loopCommand?.trim()
  if (fromLoop) return fromLoop
  const fromProfile = input.profileCommand?.trim()
  return fromProfile || undefined
}

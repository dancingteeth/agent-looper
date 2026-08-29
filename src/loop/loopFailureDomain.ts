import fs from 'node:fs'
import path from 'node:path'
import type { VerifyResult } from './loopVerify.js'
import { failureFingerprint } from './loopStagnation.js'
import { isTransportErrorMessage } from '../agents/errorFormat.js'

export const FAILURE_DOMAINS_FILENAME = 'failure-domains.ndjson'

/** Synthetic verify command when the worker died before the shell checker ran. */
export const AGENT_SDK_VERIFY_COMMAND = '(agent SDK)'

export type FailureDomainReason =
  | 'stagnation'
  | 'max_iterations'
  | 'review_gate'
  | 'review_gate_hitl'
  | 'meta_probe_failed'
  | 'agent_error'

/** Lifecycle status aligned with Mastra-style done|continue|waiting (additive). */
export type FailureDomainStatus = 'waiting'

export type FailureDomainEntry = {
  at: string
  iteration: number
  reason: FailureDomainReason
  fingerprint: string
  verify: {
    command: string
    exitCode: number | null
    reason: string
  }
  suggestion: string
  /** Present when the loop is parked for human closure (e.g. review_gate_hitl). */
  status?: FailureDomainStatus
}

export function failureDomainsPath(loopDir: string): string {
  return path.join(loopDir, FAILURE_DOMAINS_FILENAME)
}

/** All parseable failure-domain rows (malformed lines skipped). */
export function readFailureDomainEntries(loopDir: string): FailureDomainEntry[] {
  const filePath = failureDomainsPath(loopDir)
  if (!fs.existsSync(filePath)) return []
  const entries: FailureDomainEntry[] = []
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean)) {
    try {
      entries.push(JSON.parse(line) as FailureDomainEntry)
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

/** Last failure-domain row in the loop dir, or null when missing/empty. */
export function readLatestFailureDomain(loopDir: string): FailureDomainEntry | null {
  return readFailureDomainEntries(loopDir).at(-1) ?? null
}

/** True when the loop was parked for human closure (review_gate_hitl / status waiting). */
export function isHitlWaitingFailureDomain(entry: FailureDomainEntry | null): boolean {
  if (!entry) return false
  return entry.reason === 'review_gate_hitl' || entry.status === 'waiting'
}

/** One-line domain summary for reports (reason + optional status). */
export function formatFailureDomainLine(entry: FailureDomainEntry | null): string | undefined {
  if (!entry) return undefined
  return entry.status
    ? `Failure domain: ${entry.reason} (status: ${entry.status})`
    : `Failure domain: ${entry.reason}`
}

function suggestionForReason(reason: FailureDomainReason, repeatCount?: number): string {
  switch (reason) {
    case 'stagnation':
      return `Same verifier output ${repeatCount ?? 3} times — tune verify/GOAL.md, escalate model, or fix manually before re-running.`
    case 'max_iterations':
      return 'Max iterations exhausted — narrow GOAL.md, strengthen verify backpressure, or split into smaller loops.'
    case 'review_gate':
      return 'Review BLOCKERS persisted — fix blockers in-repo or adjust review expectations.'
    case 'review_gate_hitl':
      return 'Review BLOCKERS / unparseable verdict persisted — a HITL task was created for human sign-off.'
    case 'meta_probe_failed':
      return 'Meta-loop probe still failing after fix cycle — inspect failure-context.md and failure-domains.ndjson.'
    case 'agent_error':
      return 'Agent SDK threw during an iteration — see stderr. Re-run or inspect the agent session/API key.'
    default: {
      const _exhaustive: never = reason
      return String(_exhaustive)
    }
  }
}

export function appendFailureDomain(
  loopDir: string,
  entry: Omit<FailureDomainEntry, 'at' | 'suggestion'> & {
    suggestion?: string
    repeatCount?: number
  },
): void {
  const { suggestion: customSuggestion, repeatCount, ...rest } = entry
  const record: FailureDomainEntry = {
    ...rest,
    at: new Date().toISOString(),
    suggestion: customSuggestion ?? suggestionForReason(entry.reason, repeatCount),
  }
  fs.appendFileSync(failureDomainsPath(loopDir), `${JSON.stringify(record)}\n`, 'utf8')
  console.error(`[agent-loop] failure domain logged → ${FAILURE_DOMAINS_FILENAME} (${entry.reason})`)
}

export function logFailureDomainFromVerify(
  loopDir: string,
  options: {
    iteration: number
    reason: FailureDomainReason
    verify: VerifyResult
    repeatCount?: number
    status?: FailureDomainStatus
  },
): void {
  appendFailureDomain(loopDir, {
    iteration: options.iteration,
    reason: options.reason,
    fingerprint: failureFingerprint(options.verify),
    verify: {
      command: options.verify.command,
      exitCode: options.verify.exitCode,
      reason: options.verify.reason,
    },
    repeatCount: options.repeatCount,
    ...(options.status ? { status: options.status } : {}),
  })
}

export function logFailureDomainFromAgentError(
  loopDir: string,
  options: { iteration: number; message: string },
): void {
  const transport = isTransportErrorMessage(options.message)
  appendFailureDomain(loopDir, {
    iteration: options.iteration,
    reason: 'agent_error',
    fingerprint: `agent_error|${transport ? 'transport|' : ''}${options.message.slice(0, 280)}`,
    verify: {
      command: AGENT_SDK_VERIFY_COMMAND,
      exitCode: null,
      reason: options.message.slice(0, 500),
    },
    suggestion: suggestionForAgentError(options.message, transport),
  })
}

function suggestionForAgentError(message: string, transport: boolean): string | undefined {
  if (transport) {
    return 'Transport/provider failure before verify (e.g. OpenCode session.prompt fetch failed) — not a product test failure. Re-run; harness recycles the local OpenCode server on transport retries. Check OPENCODE_API_KEY / network / Go gateway status.'
  }
  if (/timed out after \d+ms|no tool progress/i.test(message)) {
    return 'Worker hung or hit the session wall before verify. escalateModel switches on the next iteration when set; this is not a verifier failure.'
  }
  return undefined
}

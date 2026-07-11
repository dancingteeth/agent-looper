import fs from 'node:fs'
import path from 'node:path'
import type { VerifyResult } from './loopVerify.js'
import { failureFingerprint } from './loopStagnation.js'

export const FAILURE_DOMAINS_FILENAME = 'failure-domains.ndjson'

export type FailureDomainReason =
  | 'stagnation'
  | 'max_iterations'
  | 'review_gate'
  | 'review_gate_hitl'
  | 'meta_probe_failed'
  | 'agent_error'

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
}

export function failureDomainsPath(loopDir: string): string {
  return path.join(loopDir, FAILURE_DOMAINS_FILENAME)
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
  entry: Omit<FailureDomainEntry, 'at' | 'suggestion'> & { suggestion?: string; repeatCount?: number },
): void {
  const record: FailureDomainEntry = {
    at: new Date().toISOString(),
    suggestion: entry.suggestion ?? suggestionForReason(entry.reason, entry.repeatCount),
    ...entry,
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
  })
}

export function logFailureDomainFromAgentError(
  loopDir: string,
  options: { iteration: number; message: string },
): void {
  appendFailureDomain(loopDir, {
    iteration: options.iteration,
    reason: 'agent_error',
    fingerprint: `agent_error|${options.message.slice(0, 300)}`,
    verify: {
      command: '(agent SDK)',
      exitCode: null,
      reason: options.message.slice(0, 500),
    },
  })
}

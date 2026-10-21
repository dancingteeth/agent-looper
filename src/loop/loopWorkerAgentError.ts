import { formatErrorChain, isTransportAgentError } from '../agents/errorFormat.js'
import { partialAgentRunFromError } from '../agents/agentRunFailed.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'

export type WorkerAgentErrorClass = 'transient' | 'fatal'

const FATAL_AGENT_ERROR_PATTERN =
  /\bCURSOR_API_KEY\b|\bOPENCODE_API_KEY\b|is not set\b|not installed\b|invalid model|unknown model|model unavailable|authentication|unauthorized|\b401\b|\b403\b|permission denied|\b(missing|invalid|no) api key\b/i

/**
 * Broad on purpose: Cursor often surfaces transport/provider faults as a generic
 * `status=error` / "Cursor agent run failed" wrapper; connection stalls and empty
 * turns are retried on the next iteration rather than ending the run.
 */
const TRANSIENT_AGENT_ERROR_PATTERN =
  /connection stalled|stalled repeatedly|rate.?limit|\b429\b|\b50[234]\b|overloaded|status=error|Cursor agent run failed|fetch failed|socket hang up|timed out after \d+ms|no tool progress|text stream without tools|returned empty result/i

export function classifyWorkerAgentError(err: unknown): WorkerAgentErrorClass {
  const message = formatErrorChain(err)
  if (FATAL_AGENT_ERROR_PATTERN.test(message)) return 'fatal'
  if (isTransportAgentError(err) || TRANSIENT_AGENT_ERROR_PATTERN.test(message)) {
    return 'transient'
  }
  return 'fatal'
}

export function extractPartialWorkerRun(err: unknown): AgentRunResult | undefined {
  const partial = partialAgentRunFromError(err)
  if (!partial) return undefined
  return {
    ...partial,
    text: partial.text ?? '',
  }
}

/** Backoff before the next iteration after a transient worker fault (ms). */
export const TRANSIENT_AGENT_ITERATION_BACKOFF_MS = 5000

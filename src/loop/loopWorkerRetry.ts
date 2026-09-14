import type { LoopAgentSession } from '../agents/agentRunner.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import { formatErrorChain, isTransportAgentError } from '../agents/errorFormat.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import type { ResolvedLoopAgent } from './loopAgentConfig.js'
import { AGENT_SDK_VERIFY_COMMAND } from './loopFailureDomain.js'
import type { VerifyResult } from './loopVerify.js'
import { attachVerifyClass } from './verifyClass.js'

const SDK_RETRY_DELAYS_MS = [5000, 15_000] as const

/**
 * Heuristic for retryable provider errors. Deliberately narrow: bare substrings
 * like `network` or `503` anywhere in a message produced false positives (paths,
 * validation errors) and burned retries on permanent failures. Internal long-run
 * timeouts ("timed out after …ms") intentionally do NOT match — a 45-minute run
 * should not be repeated blindly.
 */
const TRANSIENT_AGENT_ERROR_PATTERN =
  /rate.?limit|\b429\b|\b50[234]\b|\bECONNRESET\b|\bETIMEDOUT\b|\bEAI_AGAIN\b|socket hang up|fetch failed|\btimeout\b|retryable=true/i

export function isTransientAgentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return TRANSIENT_AGENT_ERROR_PATTERN.test(message) || isTransportAgentError(err)
}

/**
 * Hung or wall-clock worker turns. Not retried on the same model (that would
 * re-burn the 45m cap). The loop continues onto `escalateModel` instead.
 */
const RECOVERABLE_WORKER_FAULT_PATTERN = /timed out after \d+ms|no tool progress/i

export function isRecoverableWorkerFault(err: unknown): boolean {
  return RECOVERABLE_WORKER_FAULT_PATTERN.test(formatErrorChain(err))
}

export function shouldEscalateAfterWorkerFault(
  err: unknown,
  config: { escalateModel?: string; maxIterations: number },
  iterationAgent: ResolvedLoopAgent,
  iteration: number,
): boolean {
  if (!isRecoverableWorkerFault(err)) return false
  if (!config.escalateModel) return false
  if (iterationAgent.model === config.escalateModel) return false
  if (iteration >= config.maxIterations) return false
  return true
}

/** Synthetic verify record for an iteration whose worker call never returned. */
export function workerSdkVerifyResult(message: string, escalateModel?: string): VerifyResult {
  const hung = RECOVERABLE_WORKER_FAULT_PATTERN.test(message)
  let reason: string
  if (escalateModel) {
    reason = `Worker timed out or made no tool progress — next iteration uses ${escalateModel}.`
  } else if (hung) {
    reason = 'Worker timed out or made no tool progress — loop stopped.'
  } else {
    reason = 'Agent SDK error before verify.'
  }
  return attachVerifyClass({
    complete: false,
    command: AGENT_SDK_VERIFY_COMMAND,
    exitCode: null,
    stdout: '',
    stderr: message,
    reason,
  })
}

/** Tear down and recreate the worker backend when the session supports it; failures only warn. */
export async function recycleWorkerSession(session: LoopAgentSession): Promise<void> {
  if (!session.recycle) return
  try {
    await session.recycle()
  } catch (recycleErr) {
    console.error(
      `[agent-loop] warn: agent session recycle failed: ${formatErrorChain(recycleErr)}`,
    )
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Run one worker prompt, retrying transient provider errors with fixed backoff. */
export async function runIterationWithRetry(
  session: LoopAgentSession,
  prompt: string,
  iterationAgent: ResolvedLoopAgent,
  options: { verbose?: boolean; assistantOutput?: 'stdout' | 'none'; collector?: StreamCollector },
): Promise<AgentRunResult> {
  let lastError: unknown
  for (let attempt = 0; attempt <= SDK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await session.runIterationPrompt(prompt, iterationAgent, options)
      return attempt > 0 ? { ...result, sdkRetries: attempt } : result
    } catch (err) {
      lastError = err
      if (attempt >= SDK_RETRY_DELAYS_MS.length || !isTransientAgentError(err)) {
        throw err
      }
      const delayMs = SDK_RETRY_DELAYS_MS[attempt]!
      console.error(
        `[agent-loop] transient agent error (retry ${attempt + 1}/${SDK_RETRY_DELAYS_MS.length} in ${delayMs}ms): ${formatErrorChain(err)}`,
      )
      // New OpenCode sessions on the same wedged local server still fail with
      // bare "fetch failed" — recycle the backend before sleeping.
      if (isTransportAgentError(err)) {
        await recycleWorkerSession(session)
      }
      await sleep(delayMs)
    }
  }
  throw lastError
}

import path from 'node:path'
import { Agent, CursorAgentError, JsonlLocalAgentStore } from '@cursor/sdk'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import {
  CURSOR_WORKER_MODEL,
  type CursorSdkModel,
} from '../loop/loopAgentConfig.js'
import { printRunStream } from '../stream/streamRun.js'
import { StreamCollector } from '../stream/streamCollect.js'
import { assertCursorSdkModelAllowed } from '../usage/modelPolicy.js'
import { createUsageRecord } from '../usage/loopUsage.js'
import { installHttp2UnhandledRejectionGuard } from './http2RejectionGuard.js'

export const AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV = 'AGENT_LOOP_CURSOR_TIMEOUT_MS'
const DEFAULT_CURSOR_SESSION_TIMEOUT_MS = 45 * 60 * 1000

/** Resolve session timeout before starting a Cursor run (fail fast on bad env). */
export function resolveCursorSessionTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env[AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV]?.trim()
  if (!raw) return DEFAULT_CURSOR_SESSION_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      `${AGENT_LOOP_CURSOR_TIMEOUT_MS_ENV} must be a positive number of milliseconds`,
    )
  }
  return parsed
}

export class CursorRunTimeoutError extends Error {}

/**
 * Race a Cursor run against a timeout. On timeout, `onTimeout` fires first
 * (best-effort — errors are logged, not thrown) so the caller can cancel the
 * remote run; a local reject alone would leave the cloud agent running.
 */
export async function waitForCursorRun<T>(
  waitPromise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => Promise<void>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      waitPromise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new CursorRunTimeoutError(`Cursor agent run timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } catch (err) {
    if (err instanceof CursorRunTimeoutError && onTimeout) {
      try {
        await onTimeout()
      } catch (cancelErr) {
        const message = cancelErr instanceof Error ? cancelErr.message : String(cancelErr)
        console.error(`[agent-loop:cursor] remote run cancel failed (non-blocking): ${message}`)
      }
    }
    throw err
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export type CursorAgentRunOptions = {
  verbose?: boolean
  /**
   * Worker defaults to composer-2.5; review/judge may use grok-4.6.
   * Never Composer Fast / Grok Fast.
   */
  modelId?: CursorSdkModel
  /** Validates against worker vs review allowlists. Defaults to worker. */
  role?: 'worker' | 'review'
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
}

function requireApiKey(): string {
  const apiKey = process.env.CURSOR_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('CURSOR_API_KEY is not set. Run via doppler or agent-check cursor')
  }
  return apiKey
}

export async function runCursorAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  options: CursorAgentRunOptions = {},
): Promise<AgentRunResult> {
  const role = options.role ?? 'worker'
  const modelId = options.modelId ?? CURSOR_WORKER_MODEL
  assertCursorSdkModelAllowed(modelId, role)

  const apiKey = requireApiKey()
  // Fail fast on a bad timeout before Agent.create / send (avoids burning a paid run).
  const timeoutMs = resolveCursorSessionTimeoutMs()
  const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
  const phase = options.phase ?? (role === 'review' ? 'review' : 'implement')
  const storeDir = path.join(ctx.repoRoot, '.cursor', 'sdk-runs')
  const store = new JsonlLocalAgentStore(storeDir)
  const releaseHttp2Guard = installHttp2UnhandledRejectionGuard()

  const agentOptions = {
    apiKey,
    model: { id: modelId },
    local: {
      cwd: ctx.repoRoot,
      autoReview: true,
      store,
    },
  }

  try {
    await using agent = await Agent.create(agentOptions)
    const run = await agent.send(prompt)
    console.error(
      `[agent-loop:cursor] role=${role} run_id=${run.id} agent_id=${run.agentId} model=${modelId}`,
    )
    await printRunStream(run.stream(), {
      verbose,
      assistantOutput: options.assistantOutput ?? 'stdout',
      collector: options.collector,
      onAssistantText: options.onAssistantText,
    })
    const result = await waitForCursorRun(run.wait(), timeoutMs, async () => {
      console.error(`[agent-loop:cursor] timeout — cancelling remote run run_id=${run.id}`)
      await run.cancel()
    })

    if (result.status === 'error') {
      throw new Error('Cursor agent run failed (status=error)')
    }
    if (result.status === 'cancelled') {
      throw new Error('Cursor agent run cancelled')
    }

    const text = result.result?.trim()
    if (!text) {
      throw new Error('Cursor agent returned empty result')
    }

    // RunResult.usage is TokenUsage when the runtime reported it (no USD field).
    const usage = result.usage
      ? createUsageRecord({
          phase,
          runtime: 'cursor',
          model: modelId,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cacheReadTokens: result.usage.cacheReadTokens,
          cacheWriteTokens: result.usage.cacheWriteTokens,
        })
      : undefined

    return {
      text,
      usage,
      sessionRef: { provider: 'cursor', runId: run.id, agentId: run.agentId },
      toolSummary: options.collector?.toolSummary,
      transcriptEvents: options.collector?.events,
    }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK error: ${err.message}`)
    }
    throw err
  } finally {
    releaseHttp2Guard()
  }
}

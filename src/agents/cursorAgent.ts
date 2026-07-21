import path from 'node:path'
import { Agent, CursorAgentError, JsonlLocalAgentStore } from '@cursor/sdk'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import {
  CURSOR_WORKER_MODEL,
  type CursorSdkModel,
} from '../loop/loopAgentConfig.js'
import { printRunStream } from '../stream/streamRun.js'
import { assertCursorSdkModelAllowed } from '../usage/modelPolicy.js'
import { createUsageRecord } from '../usage/loopUsage.js'

const DEFAULT_CURSOR_SESSION_TIMEOUT_MS = 45 * 60 * 1000

function resolveCursorSessionTimeoutMs(): number {
  const raw = process.env.AGENT_LOOP_CURSOR_TIMEOUT_MS?.trim()
  if (!raw) return DEFAULT_CURSOR_SESSION_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('AGENT_LOOP_CURSOR_TIMEOUT_MS must be a positive number of milliseconds')
  }
  return parsed
}

async function waitForCursorRun<T>(
  waitPromise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      waitPromise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Cursor agent run timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

export type CursorAgentRunOptions = {
  verbose?: boolean
  /**
   * Worker defaults to composer-2.5; review/judge may use grok-4.5.
   * Never Composer Fast / Grok Fast.
   */
  modelId?: CursorSdkModel
  /** Validates against worker vs review allowlists. Defaults to worker. */
  role?: 'worker' | 'review'
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review'
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
  const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
  const phase = options.phase ?? (role === 'review' ? 'review' : 'implement')
  const storeDir = path.join(ctx.repoRoot, '.cursor', 'sdk-runs')
  const store = new JsonlLocalAgentStore(storeDir)

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
    })
    const result = await waitForCursorRun(run.wait(), resolveCursorSessionTimeoutMs())

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

    return { text, usage }
  } catch (err) {
    if (err instanceof CursorAgentError) {
      throw new Error(`Cursor SDK error: ${err.message}`)
    }
    throw err
  }
}

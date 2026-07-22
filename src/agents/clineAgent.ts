import { ClineCore, type CoreSessionEvent, type ClineCore as ClineCoreType } from '@cline/sdk'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { handleClineSessionEvent } from '../stream/streamClineSession.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { CLINE_LOOP_TOOL_POLICIES } from './loopToolPolicy.js'
import { assertPosixShell } from './shellPreflight.js'
import {
  CLINE_INNER_MAX_ITERATIONS,
  resolveInnerAgentStatus,
} from './innerAgentStatus.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  type LoopReasoningEffort,
} from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'

export { CLINE_INNER_MAX_ITERATIONS }
const SESSION_TIMEOUT_MS = 45 * 60 * 1000

export type ClineProviderId = typeof LOOP_RUNTIME_CLINE_PASS | typeof LOOP_RUNTIME_CLINE

export type ClineAgentRunOptions = {
  verbose?: boolean
  modelId: string
  /** ClinePass subscription vs usage-billing credits. Defaults to cline-pass. */
  providerId?: ClineProviderId
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  reasoningEffort?: LoopReasoningEffort
  collector?: StreamCollector
}

function requireClineApiKey(): string {
  const apiKey = process.env.CLINE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('CLINE_API_KEY is not set. Run via doppler or agent-check cline')
  }
  return apiKey
}

function resolveClineProviderId(providerId: ClineProviderId | undefined): ClineProviderId {
  return providerId ?? LOOP_RUNTIME_CLINE_PASS
}

async function readSessionUsage(
  cline: ClineCoreType,
  sessionId: string,
  modelId: string,
  phase: 'implement' | 'review' | 'verify',
  providerId: ClineProviderId,
): Promise<AgentRunResult['usage']> {
  try {
    const summary = await cline.getAccumulatedUsage(sessionId)
    const usage = summary?.aggregateUsage ?? summary?.usage
    if (!usage) return undefined

    return createUsageRecord({
      phase,
      runtime: providerId,
      model: modelId,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      providerCostUsd: usage.totalCost,
    })
  } catch {
    return undefined
  }
}

function waitForClineSession(
  cline: ClineCoreType,
  sessionId: string,
  options: { verbose: boolean; assistantOutput: 'stdout' | 'none'; collector?: StreamCollector },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      unsubscribe()
      clearTimeout(timer)
      fn()
    }

    const unsubscribe = cline.subscribe((event: CoreSessionEvent) => {
      handleClineSessionEvent(
        event,
        sessionId,
        options,
        (text) => finish(() => resolve(text.trim())),
        (error) => finish(() => reject(error)),
      )

      if (event.type === 'ended' && event.payload.sessionId === sessionId) {
        void cline
          .readMessages(sessionId)
          .then((messages: Array<{ role: string; content: unknown }>) => {
            const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
            const text =
              typeof lastAssistant?.content === 'string'
                ? lastAssistant.content
                : extractTextFromMessageContent(lastAssistant?.content)
            if (text.trim()) {
              finish(() => resolve(text.trim()))
            } else {
              finish(() =>
                reject(
                  new Error(
                    `Cline session ended without assistant text (${event.payload.reason})`,
                  ),
                ),
              )
            }
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err)
            finish(() => reject(new Error(`Cline session ended (${event.payload.reason}): ${message}`)))
          })
      }
    })

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`Cline session timed out after ${SESSION_TIMEOUT_MS}ms`)))
    }, SESSION_TIMEOUT_MS)
  })
}

function extractTextFromMessageContent(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((block) => {
      if (typeof block !== 'object' || block === null) return ''
      const record = block as { type?: string; text?: string }
      return record.type === 'text' ? (record.text ?? '') : ''
    })
    .join('')
}

export type ClineLoopSession = {
  runPrompt(prompt: string, options: ClineAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

export async function createClineLoopSession(ctx: RepoContext): Promise<ClineLoopSession> {
  await assertPosixShell()
  const apiKey = requireClineApiKey()
  const systemPrompt = buildLoopSystemPrompt(ctx)
  const clientName = ctx.profile.clientName

  const cline = await ClineCore.create({
    clientName,
    backendMode: 'local',
  })

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const assistantOutput = options.assistantOutput ?? 'stdout'
      const phase = options.phase ?? 'implement'
      const providerId = resolveClineProviderId(options.providerId)

      const started = await cline.start({
        prompt,
        interactive: false,
        config: {
          providerId,
          modelId: options.modelId,
          apiKey,
          systemPrompt,
          cwd: ctx.repoRoot,
          workspaceRoot: ctx.repoRoot,
          enableTools: true,
          enableSpawnAgent: false,
          enableAgentTeams: false,
          yolo: true,
          maxIterations: CLINE_INNER_MAX_ITERATIONS,
          checkpoint: { enabled: false },
          ...(options.reasoningEffort !== undefined && options.reasoningEffort !== 'none'
            ? { reasoningEffort: options.reasoningEffort, thinking: true }
            : {}),
        },
        toolPolicies: { ...CLINE_LOOP_TOOL_POLICIES },
      })

      console.error(
        `[agent-loop:cline] provider=${providerId} session_id=${started.sessionId} model=${options.modelId}`,
      )

      try {
        let text: string
        if (started.result?.text?.trim()) {
          text = started.result.text.trim()
        } else {
          text = await waitForClineSession(cline, started.sessionId, {
            verbose,
            assistantOutput,
            collector: options.collector,
          })
        }

        const usage = await readSessionUsage(
          cline,
          started.sessionId,
          options.modelId,
          phase,
          providerId,
        )
        if (usage) {
          console.error(
            `[agent-loop:cline] usage in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(4)} (${usage.costSource})`,
          )
        }

        return {
          text,
          usage,
          innerAgent: resolveInnerAgentStatus(text, 'cline'),
          sessionRef: { provider: 'cline', sessionId: started.sessionId },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } finally {
        await cline.stop(started.sessionId).catch(() => undefined)
        await cline.delete(started.sessionId).catch(() => undefined)
      }
    },
    async dispose() {
      await cline.dispose(`${clientName} done`)
    },
  }
}

export async function runClineAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  options: ClineAgentRunOptions,
): Promise<AgentRunResult> {
  const session = await createClineLoopSession(ctx)
  try {
    return await session.runPrompt(prompt, options)
  } finally {
    await session.dispose()
  }
}

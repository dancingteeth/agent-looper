import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import {
  LOOP_RUNTIME_PI,
  parseOpencodeModel,
} from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'
import type { StreamCollector } from '../stream/streamCollect.js'

const SESSION_TIMEOUT_MS = 45 * 60 * 1000

export type PiAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
}

export type PiLoopSession = {
  runPrompt(prompt: string, options: PiAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

type PiAssistantMessage = {
  role: string
  stopReason?: string
  errorMessage?: string
  content: ReadonlyArray<{ type?: string; text?: string }>
  usage?: {
    input?: number
    output?: number
    cacheRead?: number
    cacheWrite?: number
    cost?: number
  }
}

function extractPiAssistantText(messages: readonly unknown[]): string {
  const last = [...messages].reverse().find((m) => {
    return typeof m === 'object' && m !== null && (m as { role?: string }).role === 'assistant'
  }) as PiAssistantMessage | undefined
  if (!last) {
    throw new Error('Pi session ended without assistant message')
  }
  if (last.stopReason === 'error' || last.stopReason === 'aborted') {
    throw new Error(last.errorMessage ?? `Pi request ${last.stopReason}`)
  }
  const text = last.content
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()
  if (!text) {
    throw new Error('Pi session ended without assistant text')
  }
  return text
}

function readPiUsage(
  messages: readonly unknown[],
  modelId: string,
  phase: NonNullable<PiAgentRunOptions['phase']>,
): AgentRunResult['usage'] {
  const last = [...messages].reverse().find((m) => {
    return typeof m === 'object' && m !== null && (m as { role?: string }).role === 'assistant'
  }) as PiAssistantMessage | undefined
  const usage = last?.usage
  if (!usage) return undefined
  return createUsageRecord({
    phase,
    runtime: LOOP_RUNTIME_PI,
    model: modelId,
    inputTokens: usage.input ?? 0,
    outputTokens: usage.output ?? 0,
    cacheReadTokens: usage.cacheRead ?? 0,
    cacheWriteTokens: usage.cacheWrite ?? 0,
    providerCostUsd: usage.cost,
  })
}

export async function createPiLoopSession(ctx: RepoContext): Promise<PiLoopSession> {
  await assertPosixShell()
  const systemPrompt = buildLoopSystemPrompt(ctx)

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const assistantOutput = options.assistantOutput ?? 'stdout'
      const phase = options.phase ?? 'implement'
      const { providerID, modelID } = parseOpencodeModel(options.modelId)

      const { createAgentSession, SessionManager } = await import('@earendil-works/pi-coding-agent')
      const { getModel } = await import('@earendil-works/pi-ai/compat')

      const resolvePiModel = getModel as (
        provider: string,
        modelId: string,
      ) => ReturnType<typeof getModel>
      const model = resolvePiModel(providerID, modelID)
      if (!model) {
        throw new Error(
          `Pi model not found: ${options.modelId}. Check provider auth (env or ~/.pi/agent/auth.json) ` +
            `and https://pi.dev/docs`,
        )
      }

      const { session } = await createAgentSession({
        cwd: ctx.repoRoot,
        model,
        thinkingLevel: 'low',
        sessionManager: SessionManager.inMemory(),
      })

      console.error(
        `[agent-loop:pi] provider=${providerID} session_id=${session.sessionId} model=${options.modelId}`,
      )

      const timeoutMs = SESSION_TIMEOUT_MS
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        const runPromise = (async () => {
          const userPrompt = `${systemPrompt}\n\n---\n\n${prompt}`
          await session.prompt(userPrompt)
          await session.waitForIdle()
        })()

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            void session.abort()
            reject(new Error(`Pi session timed out after ${timeoutMs}ms`))
          }, timeoutMs)
          timeoutHandle.unref?.()
        })

        await Promise.race([runPromise, timeoutPromise])

        const text = extractPiAssistantText(session.state.messages)
        if (assistantOutput === 'stdout' || verbose) {
          process.stdout.write(`${text}\n`)
        }

        const usage = readPiUsage(session.state.messages, options.modelId, phase)
        if (usage) {
          console.error(
            `[agent-loop:pi] usage in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(4)} (${usage.costSource})`,
          )
        }

        return {
          text,
          usage,
          innerAgent: resolveInnerAgentStatus(text, 'pi'),
          sessionRef: { provider: 'pi', sessionId: session.sessionId },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        session.dispose()
      }
    },
    async dispose() {
      return undefined
    },
  }
}

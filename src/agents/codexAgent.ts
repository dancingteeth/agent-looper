import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import { LOOP_RUNTIME_CODEX } from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'
import { emitAssistantText } from '../stream/assistantStream.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import {
  listChildPids,
  watchSpawnedChildren,
  withSpawnedChildrenPoll,
} from './processTree.js'

const SESSION_TIMEOUT_MS = 45 * 60 * 1000

export type CodexAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
}

export type CodexLoopSession = {
  runPrompt(prompt: string, options: CodexAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

type CodexUsage = {
  input_tokens: number
  cached_input_tokens: number
  cache_write_input_tokens: number
  output_tokens: number
  reasoning_output_tokens: number
}

type CodexThreadItem = {
  type?: string
  text?: string
  message?: string
}

type CodexTurn = {
  items: CodexThreadItem[]
  finalResponse: string
  usage: CodexUsage | null
}

function extractCodexText(turn: CodexTurn): string {
  const fromFinal = turn.finalResponse?.trim()
  if (fromFinal) return fromFinal

  const messages = turn.items
    .filter((item) => item.type === 'agent_message' && typeof item.text === 'string')
    .map((item) => item.text!.trim())
    .filter(Boolean)
  const joined = messages.join('\n\n').trim()
  if (joined) return joined

  const errors = turn.items
    .filter((item) => item.type === 'error' && typeof item.message === 'string')
    .map((item) => item.message!.trim())
    .filter(Boolean)
  if (errors.length > 0) {
    throw new Error(`Codex turn failed: ${errors.join('; ')}`)
  }

  throw new Error('Codex turn ended without assistant text')
}

function readCodexUsage(
  usage: CodexUsage | null | undefined,
  modelId: string,
  phase: NonNullable<CodexAgentRunOptions['phase']>,
): AgentRunResult['usage'] {
  if (!usage) return undefined
  return createUsageRecord({
    phase,
    runtime: LOOP_RUNTIME_CODEX,
    model: modelId,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: (usage.output_tokens ?? 0) + (usage.reasoning_output_tokens ?? 0),
    cacheReadTokens: usage.cached_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_write_input_tokens ?? 0,
  })
}

function composeCodexPrompt(systemPrompt: string, userPrompt: string): string {
  return `${systemPrompt}\n\n---\n\n${userPrompt}`
}

export async function createCodexLoopSession(ctx: RepoContext): Promise<CodexLoopSession> {
  await assertPosixShell()
  const systemPrompt = buildLoopSystemPrompt(ctx)

  return {
    async runPrompt(prompt, options) {
      const phase = options.phase ?? 'implement'

      let CodexCtor: typeof import('@openai/codex-sdk').Codex
      try {
        ;({ Codex: CodexCtor } = await import('@openai/codex-sdk'))
      } catch {
        throw new Error(
          '@openai/codex-sdk is not installed. Install with: pnpm add -D @openai/codex-sdk',
        )
      }

      const apiKey =
        process.env.CODEX_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim() || undefined
      const codex = new CodexCtor(apiKey ? { apiKey } : {})
      // skipGitRepoCheck: harness already resolved repoRoot; Codex otherwise requires a Git tree.
      const thread = codex.startThread({
        model: options.modelId,
        workingDirectory: ctx.repoRoot,
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
      })

      console.error(`[agent-loop:codex] model=${options.modelId} cwd=${ctx.repoRoot}`)

      const controller = new AbortController()
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      timeoutHandle = setTimeout(() => {
        controller.abort()
      }, SESSION_TIMEOUT_MS)
      timeoutHandle.unref?.()

      const before = listChildPids(process.pid)
      const watch = watchSpawnedChildren(before)
      try {
        const turn = (await withSpawnedChildrenPoll(watch, () =>
          thread.run(composeCodexPrompt(systemPrompt, prompt), {
            signal: controller.signal,
          }),
        )) as CodexTurn

        const text = extractCodexText(turn)
        emitAssistantText(options, `${text}\n`)

        const usage = readCodexUsage(turn.usage, options.modelId, phase)
        if (usage) {
          console.error(
            `[agent-loop:codex] usage in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(4)} (${usage.costSource})`,
          )
        }

        const threadId = thread.id
        return {
          text,
          usage,
          innerAgent: resolveInnerAgentStatus(text, 'codex'),
          sessionRef: threadId
            ? { provider: 'codex', sessionId: threadId }
            : { provider: 'codex' },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } catch (err) {
        if (controller.signal.aborted) {
          throw new Error(`Codex session timed out after ${SESSION_TIMEOUT_MS}ms`)
        }
        throw err
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        await watch.release()
      }
    },
    async dispose() {
      return undefined
    },
  }
}

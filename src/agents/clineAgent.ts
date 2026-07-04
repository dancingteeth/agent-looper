import { ClineCore, type CoreSessionEvent, type ClineCore as ClineCoreType } from '@cline/sdk'
import type { RepoContext } from '../context/repoContext.js'
import { handleClineSessionEvent } from '../stream/streamClineSession.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { CLINE_LOOP_TOOL_POLICIES } from './loopToolPolicy.js'
import { assertPosixShell } from './shellPreflight.js'

const CLINE_INNER_MAX_ITERATIONS = 25
const SESSION_TIMEOUT_MS = 45 * 60 * 1000

export type ClineAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
}

function requireClineApiKey(): string {
  const apiKey = process.env.CLINE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('CLINE_API_KEY is not set. Run via doppler or agent-check cline')
  }
  return apiKey
}

function waitForClineSession(
  cline: ClineCoreType,
  sessionId: string,
  options: { verbose: boolean; assistantOutput: 'stdout' | 'none' },
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
  runPrompt(prompt: string, options: ClineAgentRunOptions): Promise<string>
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

      const started = await cline.start({
        prompt,
        interactive: false,
        config: {
          providerId: 'cline-pass',
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
        },
        toolPolicies: { ...CLINE_LOOP_TOOL_POLICIES },
      })

      console.error(`[agent-loop:cline] session_id=${started.sessionId} model=${options.modelId}`)

      if (started.result?.text?.trim()) {
        return started.result.text.trim()
      }

      try {
        return await waitForClineSession(cline, started.sessionId, { verbose, assistantOutput })
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
): Promise<string> {
  const session = await createClineLoopSession(ctx)
  try {
    return await session.runPrompt(prompt, options)
  } finally {
    await session.dispose()
  }
}

import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import {
  DEFAULT_OPENCODE_GO_LOOP_MODEL,
  LOOP_RUNTIME_OPENCODE,
  parseProviderModel,
} from '../loop/loopAgentConfig.js'
import { bootstrapOpencodeProviderAuth, assertOpencodeProviderAuthReady } from './opencodeAuth.js'
import { formatErrorChain, isTransportAgentError } from './errorFormat.js'
import {
  OPENCODE_SESSION_TIMEOUT_MS,
  pickLatestAssistantMessage,
  waitForOpencodeSessionTurn,
  type OpencodeAgentRunOptions,
} from './opencodeTurn.js'
import { createUsageRecord } from '../usage/loopUsage.js'

export type { OpencodeAgentRunOptions } from './opencodeTurn.js'
export {
  OPENCODE_SESSION_TIMEOUT_MS,
  OPENCODE_STALL_MS,
  OPENCODE_HEARTBEAT_MS,
} from './opencodeTurn.js'

export type OpencodeLoopSession = {
  runPrompt(prompt: string, options: OpencodeAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

async function reserveFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to reserve a free port for OpenCode server'))
        return
      }
      const { port } = address
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

/** Prefer local node_modules/.bin so `opencode` resolves without a global install. */
function pathWithLocalOpencodeBins(repoRoot: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // dist/agents → package root; src/agents under vitest → same shape after build
  const packageRoot = path.resolve(here, '../..')
  const bins = [
    path.join(repoRoot, 'node_modules', '.bin'),
    path.join(packageRoot, 'node_modules', '.bin'),
  ]
  const existing = process.env.PATH ?? ''
  return [...bins, existing].join(path.delimiter)
}

function extractTextFromParts(parts: ReadonlyArray<{ type?: string; text?: string }> | undefined): string {
  if (!parts?.length) return ''
  return parts
    .map((part) => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

function unwrapData<T>(result: { data?: T; error?: unknown }, label: string): T {
  if (result.error) {
    throw new Error(`OpenCode ${label} failed: ${formatErrorChain(result.error)}`, {
      cause: result.error instanceof Error ? result.error : undefined,
    })
  }
  if (result.data === undefined) {
    throw new Error(`OpenCode ${label} returned no data`)
  }
  return result.data
}

async function autoApprovePermissions(
  client: {
    event: {
      subscribe: () => Promise<{
        stream: AsyncIterable<{ type: string; properties?: Record<string, unknown> }>
      }>
    }
    postSessionIdPermissionsPermissionId: (input: {
      path: { id: string; permissionID: string }
      body: { response: 'once' | 'always' | 'reject' }
      query?: { directory?: string }
    }) => Promise<unknown>
  },
  directory: string,
  signal: AbortSignal,
): Promise<void> {
  const events = await client.event.subscribe()
  ;(async () => {
    try {
      for await (const event of events.stream) {
        if (signal.aborted) break
        if (event.type !== 'permission.updated') continue
        const props = event.properties ?? {}
        const sessionID = typeof props.sessionID === 'string' ? props.sessionID : undefined
        const permissionID = typeof props.id === 'string' ? props.id : undefined
        if (!sessionID || !permissionID) continue
        await client
          .postSessionIdPermissionsPermissionId({
            path: { id: sessionID, permissionID },
            body: { response: 'always' },
            query: { directory },
          })
          .catch(() => undefined)
      }
    } catch {
      // Stream ends when server closes — expected on dispose.
    }
  })().catch(() => undefined)
}

function wrapOpencodePromptError(
  err: unknown,
  ctx: { providerID: string; modelId: string; sessionId: string },
): Error {
  const chain = formatErrorChain(err)
  const transportHint =
    isTransportAgentError(err) || /\[layer=transport\]/i.test(chain)
      ? ' [layer=transport — provider/TLS/reset or wedged local OpenCode server; not a verifier failure]'
      : ''
  return new Error(
    `OpenCode session.prompt failed (provider=${ctx.providerID} model=${ctx.modelId} session=${ctx.sessionId}): ${chain}${transportHint}`,
    { cause: err instanceof Error ? err : undefined },
  )
}

export async function createOpencodeLoopSession(ctx: RepoContext): Promise<OpencodeLoopSession> {
  await assertPosixShell()
  const systemPrompt = buildLoopSystemPrompt(ctx)
  const directory = ctx.repoRoot

  const { createOpencode, createOpencodeClient } = await import('@opencode-ai/sdk')
  const port = await reserveFreePort()
  const previousPath = process.env.PATH
  process.env.PATH = pathWithLocalOpencodeBins(directory)

  let server: { url: string; close(): void }
  let client: Awaited<ReturnType<typeof createOpencode>>['client']
  try {
    const started = await createOpencode({
      hostname: '127.0.0.1',
      port,
      timeout: 30_000,
      config: {
        autoupdate: false,
        model: DEFAULT_OPENCODE_GO_LOOP_MODEL,
        permission: {
          edit: 'allow',
          bash: 'allow',
          webfetch: 'allow',
          doom_loop: 'allow',
          external_directory: 'deny',
        },
      },
    })
    server = started.server
    client = started.client
  } catch (err) {
    process.env.PATH = previousPath
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Failed to start OpenCode server (${message}). Install the CLI: pnpm add -D opencode-ai ` +
        `and ensure \`opencode\` is on PATH. See https://opencode.ai/docs/`,
    )
  }

  // Re-bind client with project directory (createOpencode client may omit it).
  client = createOpencodeClient({
    baseUrl: server.url,
    directory,
    throwOnError: false,
  })

  const wiredProviders = await bootstrapOpencodeProviderAuth(client, directory)
  if (wiredProviders.length > 0) {
    console.error(`[agent-loop:opencode] auth wired for: ${wiredProviders.join(', ')}`)
  }

  const permissionAbort = new AbortController()
  await autoApprovePermissions(client, directory, permissionAbort.signal)

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const assistantOutput = options.assistantOutput ?? 'stdout'
      const phase = options.phase ?? 'implement'
      const { providerID, modelID } = parseProviderModel(options.modelId)
      assertOpencodeProviderAuthReady({ providerID, wiredProviders })

      const created = unwrapData(
        await client.session.create({
          body: { title: `agent-loop:${phase}` },
          query: { directory },
        }),
        'session.create',
      )
      const sessionId = created.id

      console.error(
        `[agent-loop:opencode] provider=${providerID} session_id=${sessionId} model=${options.modelId}`,
      )

      const turnAbort = new AbortController()
      try {
        // Subscribe + start the wait loop *before* promptAsync so we cannot miss
        // early session.idle / message events. promptAsync returns HTTP 204 immediately;
        // blocking session.prompt used to hold the connection and hit UND_ERR_HEADERS_TIMEOUT.
        const events = await client.event.subscribe()
        const turnPromise = waitForOpencodeSessionTurn({
          sessionId,
          events: events.stream,
          timeoutMs: OPENCODE_SESSION_TIMEOUT_MS,
          signal: turnAbort.signal,
          onHeartbeat: (elapsedMs, lastEventType) => {
            console.error(
              `[agent-loop:opencode] still working session=${sessionId} elapsed=${Math.round(elapsedMs / 1000)}s lastEvent=${lastEventType ?? 'none'}`,
            )
          },
        })

        try {
          unwrapData(
            await client.session.promptAsync({
              path: { id: sessionId },
              query: { directory },
              body: {
                model: { providerID, modelID },
                system: systemPrompt,
                parts: [{ type: 'text', text: prompt }],
              },
            }),
            'session.promptAsync',
          )
        } catch (err) {
          turnAbort.abort()
          await turnPromise.catch(() => undefined)
          throw wrapOpencodePromptError(err, {
            providerID,
            modelId: options.modelId,
            sessionId,
          })
        }

        console.error(
          `[agent-loop:opencode] promptAsync accepted — waiting for session.idle`,
        )

        const turn = await turnPromise

        if (turn.kind === 'error') {
          void client.session
            .abort({ path: { id: sessionId }, query: { directory } })
            .catch(() => undefined)
          throw wrapOpencodePromptError(new Error(turn.message), {
            providerID,
            modelId: options.modelId,
            sessionId,
          })
        }

        const messages = unwrapData(
          await client.session.messages({
            path: { id: sessionId },
            query: { directory },
          }),
          'session.messages',
        )
        const assistant = pickLatestAssistantMessage(messages)
        if (!assistant || assistant.info.role !== 'assistant') {
          throw new Error('OpenCode session ended without an assistant message')
        }
        const assistantInfo = assistant.info
        if (assistantInfo.error) {
          const errName = assistantInfo.error.name ?? 'Error'
          const errMsg =
            'message' in assistantInfo.error
              ? String(assistantInfo.error.message)
              : errName
          throw new Error(
            `OpenCode assistant error (${errName}) (provider=${providerID} model=${options.modelId} session=${sessionId}): ${errMsg}`,
          )
        }

        const text = extractTextFromParts(assistant.parts)
        if (!text) {
          throw new Error('OpenCode session ended without assistant text')
        }

        if (assistantOutput === 'stdout' || verbose) {
          process.stdout.write(`${text}\n`)
        }

        const tokens = assistantInfo.tokens
        const usage = createUsageRecord({
          phase,
          runtime: LOOP_RUNTIME_OPENCODE,
          model: options.modelId,
          inputTokens: tokens?.input ?? 0,
          outputTokens: tokens?.output ?? 0,
          cacheReadTokens: tokens?.cache?.read ?? 0,
          cacheWriteTokens: tokens?.cache?.write ?? 0,
          providerCostUsd: assistantInfo.cost,
        })
        console.error(
          `[agent-loop:opencode] usage in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(4)} (${usage.costSource})`,
        )

        return {
          text,
          usage,
          innerAgent: resolveInnerAgentStatus(text, 'opencode'),
          sessionRef: { provider: 'opencode', sessionId },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } finally {
        turnAbort.abort()
        await client.session.abort({ path: { id: sessionId }, query: { directory } }).catch(() => undefined)
        await client.session.delete({ path: { id: sessionId }, query: { directory } }).catch(() => undefined)
      }
    },
    async dispose() {
      permissionAbort.abort()
      try {
        server.close()
      } finally {
        process.env.PATH = previousPath
      }
    },
  }
}

export async function runOpencodeAgentPrompt(
  ctx: RepoContext,
  prompt: string,
  options: OpencodeAgentRunOptions,
): Promise<AgentRunResult> {
  const session = await createOpencodeLoopSession(ctx)
  try {
    return await session.runPrompt(prompt, options)
  } finally {
    await session.dispose()
  }
}

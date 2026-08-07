import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import {
  LOOP_RUNTIME_OPENCODE,
  parseOpencodeGoModel,
} from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'
import type { StreamCollector } from '../stream/streamCollect.js'

const SESSION_TIMEOUT_MS = 45 * 60 * 1000
const SERVER_START_TIMEOUT_MS = 30_000
const OPENCODE_GO_PROVIDER_ID = 'opencode-go'

export type OpencodeAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
}

export type OpencodeLoopSession = {
  runPrompt(prompt: string, options: OpencodeAgentRunOptions): Promise<AgentRunResult>
  dispose(): Promise<void>
}

function requireOpencodeApiKey(): string {
  const apiKey = process.env.OPENCODE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENCODE_API_KEY is not set. Subscribe at https://opencode.ai/go and run via doppler or agent-check opencode',
    )
  }
  return apiKey
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
    const message =
      result.error instanceof Error
        ? result.error.message
        : typeof result.error === 'object' && result.error !== null && 'message' in result.error
          ? String((result.error as { message: unknown }).message)
          : String(result.error)
    throw new Error(`OpenCode ${label} failed: ${message}`)
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

export async function createOpencodeLoopSession(ctx: RepoContext): Promise<OpencodeLoopSession> {
  await assertPosixShell()
  const apiKey = requireOpencodeApiKey()
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
      timeout: SERVER_START_TIMEOUT_MS,
      config: {
        autoupdate: false,
        model: `${OPENCODE_GO_PROVIDER_ID}/deepseek-v4-flash`,
        enabled_providers: [OPENCODE_GO_PROVIDER_ID],
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

  const authResult = await client.auth.set({
    path: { id: OPENCODE_GO_PROVIDER_ID },
    body: { type: 'api', key: apiKey },
    query: { directory },
  })
  unwrapData(authResult, 'auth.set')

  const permissionAbort = new AbortController()
  await autoApprovePermissions(client, directory, permissionAbort.signal)

  return {
    async runPrompt(prompt, options) {
      const verbose = options.verbose ?? process.env.AGENT_LOOP_VERBOSE === '1'
      const assistantOutput = options.assistantOutput ?? 'stdout'
      const phase = options.phase ?? 'implement'
      const { providerID, modelID } = parseOpencodeGoModel(options.modelId)

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

      const timeoutMs = SESSION_TIMEOUT_MS
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        const promptPromise = client.session.prompt({
          path: { id: sessionId },
          query: { directory },
          body: {
            model: { providerID, modelID },
            system: systemPrompt,
            parts: [{ type: 'text', text: prompt }],
          },
        })

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            void client.session
              .abort({ path: { id: sessionId }, query: { directory } })
              .catch(() => undefined)
            reject(new Error(`OpenCode session timed out after ${timeoutMs}ms`))
          }, timeoutMs)
          timeoutHandle.unref?.()
        })

        const result = unwrapData(await Promise.race([promptPromise, timeoutPromise]), 'session.prompt')

        if (result.info.error) {
          const errName = result.info.error.name ?? 'Error'
          const errMsg =
            'message' in result.info.error ? String(result.info.error.message) : errName
          throw new Error(`OpenCode assistant error (${errName}): ${errMsg}`)
        }

        const text = extractTextFromParts(result.parts)
        if (!text) {
          throw new Error('OpenCode session ended without assistant text')
        }

        if (assistantOutput === 'stdout' || verbose) {
          process.stdout.write(`${text}\n`)
        }

        const tokens = result.info.tokens
        const usage = createUsageRecord({
          phase,
          runtime: LOOP_RUNTIME_OPENCODE,
          model: options.modelId,
          inputTokens: tokens?.input ?? 0,
          outputTokens: tokens?.output ?? 0,
          cacheReadTokens: tokens?.cache?.read ?? 0,
          cacheWriteTokens: tokens?.cache?.write ?? 0,
          providerCostUsd: result.info.cost,
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
        if (timeoutHandle) clearTimeout(timeoutHandle)
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

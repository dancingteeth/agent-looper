import { randomBytes } from 'node:crypto'
import type { RepoContext } from '../context/repoContext.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import { LOOP_RUNTIME_OPENCODE, parseProviderModel } from '../loop/loopAgentConfig.js'
import { assertOpencodeProviderAuthReady, bootstrapOpencodeV2ProviderAuth } from './opencodeAuth.js'
import { opencodeDanglingSkillHint } from './opencodeSkillPreflight.js'
import { formatErrorChain } from './errorFormat.js'
import {
  OPENCODE_SESSION_TIMEOUT_MS,
  adaptOpencodeV2Events,
  waitForOpencodeSessionTurn,
  type OpencodeV2Event,
} from './opencodeTurn.js'
import { createUsageRecord, formatUsageRecordLog } from '../usage/loopUsage.js'
import { emitAssistantText } from '../stream/assistantStream.js'
import { reserveFreePort, startOpencodeServe, type OpencodeServeConfig } from './opencodeServe.js'
import { spawnParentDeathReaper, trackSpawnedRoot } from './processTree.js'
import {
  releaseOpencodeServe,
  wrapOpencodePromptError,
  type OpencodeLoopSession,
} from './opencodeAgent.js'

/** Basic-auth username the 2.x server expects alongside OPENCODE_PASSWORD. */
const OPENCODE_V2_USERNAME = 'opencode'

/** Session instruction key carrying the loop system prompt (2.x has no per-prompt `system`). */
const LOOP_INSTRUCTIONS_KEY = 'agent-loop'

const SUBSCRIBE_CONNECT_TIMEOUT_MS = 30_000

type OpencodeV2Client = ReturnType<typeof import('@opencode/client').OpenCode.make>

/**
 * `event.subscribe` is lazy: the SSE request only goes out on the first `next()`.
 * Wait for `server.connected` before prompting so a fast turn cannot finish unseen.
 */
async function subscribeConnected(
  client: OpencodeV2Client,
  signal: AbortSignal,
): Promise<AsyncIterable<OpencodeV2Event>> {
  const iterator = client.event.subscribe({ signal })[Symbol.asyncIterator]()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const first = await Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`OpenCode event stream did not connect within ${SUBSCRIBE_CONNECT_TIMEOUT_MS}ms`)),
        SUBSCRIBE_CONNECT_TIMEOUT_MS,
      )
      timeoutId.unref?.()
    }),
  ]).finally(() => clearTimeout(timeoutId))
  return {
    async *[Symbol.asyncIterator]() {
      if (first.done) return
      if (first.value.type !== 'server.connected') yield first.value as OpencodeV2Event
      while (true) {
        const next = await iterator.next()
        if (next.done) return
        yield next.value as OpencodeV2Event
      }
    },
  }
}

/** Auto-approve 2.x permission asks for the life of the server (config already allows most). */
function autoApproveV2Permissions(client: OpencodeV2Client, signal: AbortSignal): void {
  ;(async () => {
    for await (const event of client.event.subscribe({ signal })) {
      if (event.type !== 'permission.asked') continue
      const { id, sessionID } = event.data as { id: string; sessionID: string }
      try {
        await client.permission.reply({ sessionID, requestID: id, decision: 'always' })
      } catch (err) {
        console.error(
          `[agent-loop:opencode] permission reply failed (session=${sessionID} permission=${id}): ${formatErrorChain(err)}`,
        )
      }
    }
  })().catch(() => undefined)
}

export async function createOpencodeV2LoopSession(
  ctx: RepoContext,
  input: { command: string; servePath: string; serveConfig: OpencodeServeConfig; restorePath: () => void },
): Promise<OpencodeLoopSession> {
  const systemPrompt = buildLoopSystemPrompt(ctx)
  const directory = ctx.repoRoot

  let OpenCode: typeof import('@opencode/client').OpenCode
  try {
    ;({ OpenCode } = await import('@opencode/client'))
  } catch {
    input.restorePath()
    throw new Error(
      'OpenCode 2.x CLI detected but @opencode/client is not installed. ' +
        'Install it (pnpm add -D @opencode/client), or pin the 1.x CLI (pnpm add -D opencode-ai@^1).',
    )
  }

  const port = await reserveFreePort()
  const password = randomBytes(24).toString('base64url')

  let server: { url: string; pid: number | undefined; close(): Promise<void> }
  try {
    server = await startOpencodeServe({
      hostname: '127.0.0.1',
      port,
      timeoutMs: 30_000,
      config: input.serveConfig,
      cwd: directory,
      env: { ...process.env, PATH: input.servePath },
      command: input.command,
      password,
    })
  } catch (err) {
    input.restorePath()
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to start OpenCode 2.x server (${message}). See https://opencode.ai/docs/`)
  }

  const untrackServe = trackSpawnedRoot(server.pid)
  const parentDeathReaper = spawnParentDeathReaper({
    parentPid: process.pid,
    rootPid: server.pid ?? 0,
  })
  const releaseServe = () =>
    releaseOpencodeServe({
      reaper: parentDeathReaper,
      untrack: untrackServe,
      close: () => server.close(),
      restorePath: input.restorePath,
    })

  try {
    const client = OpenCode.make({
      baseUrl: server.url,
      headers: {
        authorization: `Basic ${Buffer.from(`${OPENCODE_V2_USERNAME}:${password}`).toString('base64')}`,
      },
    })

    const wiredProviders = await bootstrapOpencodeV2ProviderAuth(client)
    if (wiredProviders.length > 0) {
      console.error(`[agent-loop:opencode] auth ready for: ${wiredProviders.join(', ')} (opencode 2.x)`)
    }

    const permissionAbort = new AbortController()
    autoApproveV2Permissions(client, permissionAbort.signal)

    return {
      async runPrompt(prompt, options) {
        const phase = options.phase ?? 'implement'
        const { providerID, modelID } = parseProviderModel(options.modelId)
        assertOpencodeProviderAuthReady({ providerID, wiredProviders })

        const created = await client.session.create({
          title: `agent-loop:${phase}`,
          location: { directory },
          model: { providerID, id: modelID },
        })
        const sessionId = created.id

        console.error(
          `[agent-loop:opencode] provider=${providerID} session_id=${sessionId} model=${options.modelId} (opencode 2.x)`,
        )

        const turnAbort = new AbortController()
        const onCallerAbort = () => turnAbort.abort()
        if (options.signal?.aborted) {
          turnAbort.abort()
        } else {
          options.signal?.addEventListener('abort', onCallerAbort, { once: true })
        }
        try {
          await client.session.instructions.entry.put({
            sessionID: sessionId,
            key: LOOP_INSTRUCTIONS_KEY,
            value: systemPrompt,
          })

          const events = await subscribeConnected(client, turnAbort.signal)
          const turnPromise = waitForOpencodeSessionTurn({
            sessionId,
            events: adaptOpencodeV2Events(events),
            timeoutMs: options.timeoutMs ?? OPENCODE_SESSION_TIMEOUT_MS,
            collector: options.collector,
            signal: turnAbort.signal,
            onHeartbeat: ({ elapsedMs, lastEventType, phase, busy }) => {
              console.error(
                `[agent-loop:opencode] still working session=${sessionId} elapsed=${Math.round(elapsedMs / 1000)}s phase=${phase}${busy ? ' busy' : ''} lastEvent=${lastEventType ?? 'none'}`,
              )
            },
          })

          try {
            await client.session.prompt({ sessionID: sessionId, text: prompt })
          } catch (err) {
            turnAbort.abort()
            await turnPromise.catch(() => undefined)
            throw wrapOpencodePromptError(err, { providerID, modelId: options.modelId, sessionId })
          }

          console.error(`[agent-loop:opencode] prompt accepted — waiting for session.execution`)

          const turn = await turnPromise
          if (turn.kind === 'error') {
            throw wrapOpencodePromptError(new Error(turn.message), {
              providerID,
              modelId: options.modelId,
              sessionId,
            })
          }

          const messages = await client.message.list({ sessionID: sessionId, order: 'desc', type: 'assistant' })
          const assistant = messages.data.find((message) => message.type === 'assistant')
          if (!assistant || assistant.type !== 'assistant') {
            throw new Error('OpenCode session ended without an assistant message')
          }
          if (assistant.error) {
            const errName = assistant.error.type ?? 'Error'
            const errMsg = assistant.error.message ?? errName
            throw new Error(
              `OpenCode assistant error (${errName}) (provider=${providerID} model=${options.modelId} session=${sessionId}): ${errMsg}${opencodeDanglingSkillHint(errMsg)}`,
            )
          }

          const text = assistant.content
            .map((part) => (part.type === 'text' ? part.text : ''))
            .join('')
            .trim()
          if (!text) {
            throw new Error('OpenCode session ended without assistant text')
          }

          emitAssistantText(options, `${text}\n`)

          // Fresh session per prompt, so session totals are this turn's usage (all steps).
          const info = await client.session.get({ sessionID: sessionId })
          const usage = createUsageRecord({
            phase,
            runtime: LOOP_RUNTIME_OPENCODE,
            model: options.modelId,
            inputTokens: info.tokens?.input ?? 0,
            outputTokens: info.tokens?.output ?? 0,
            cacheReadTokens: info.tokens?.cache?.read ?? 0,
            cacheWriteTokens: info.tokens?.cache?.write ?? 0,
            providerCostUsd: info.cost,
          })
          console.error(`[agent-loop:opencode] usage ${formatUsageRecordLog(usage)}`)

          return {
            text,
            usage,
            innerAgent: resolveInnerAgentStatus(text, 'opencode'),
            sessionRef: { provider: 'opencode', sessionId },
            toolSummary: options.collector?.toolSummary,
            transcriptEvents: options.collector?.events,
          }
        } finally {
          options.signal?.removeEventListener('abort', onCallerAbort)
          turnAbort.abort()
          await client.session.interrupt({ sessionID: sessionId }).catch(() => undefined)
          await client.session.remove({ sessionID: sessionId }).catch(() => undefined)
        }
      },
      async dispose() {
        permissionAbort.abort()
        await releaseServe()
      },
    }
  } catch (err) {
    await releaseServe()
    throw err
  }
}

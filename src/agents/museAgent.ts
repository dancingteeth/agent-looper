import type { RepoContext } from '../context/repoContext.js'
import type { AgentRunResult } from './agentRunResult.js'
import { buildLoopSystemPrompt } from './loopSystemPrompt.js'
import { assertPosixShell } from './shellPreflight.js'
import { resolveInnerAgentStatus } from './innerAgentStatus.js'
import {
  LOOP_RUNTIME_MUSE,
  type LoopReasoningEffort,
} from '../loop/loopAgentConfig.js'
import { createUsageRecord } from '../usage/loopUsage.js'
import { emitAssistantText } from '../stream/assistantStream.js'
import type { StreamCollector } from '../stream/streamCollect.js'
import { readPackageVersion } from '../telemetry/looperTelemetry.js'
import {
  listChildPids,
  watchSpawnedChildren,
  type SpawnedSubtreeWatch,
} from './processTree.js'

export const MUSE_SESSION_TIMEOUT_MS = 45 * 60 * 1000
export const AGENT_LOOP_MUSE_TIMEOUT_MS_ENV = 'AGENT_LOOP_MUSE_TIMEOUT_MS'

export type MuseAgentRunOptions = {
  verbose?: boolean
  modelId: string
  assistantOutput?: 'stdout' | 'none'
  phase?: 'implement' | 'review' | 'verify'
  collector?: StreamCollector
  reasoningEffort?: LoopReasoningEffort
  onAssistantText?: (chunk: string) => void
}

export type MuseLoopSession = {
  runPrompt(prompt: string, options: MuseAgentRunOptions): Promise<AgentRunResult>
  recycle(): Promise<void>
  dispose(): Promise<void>
}

type MuseTokenUsage = {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

type MuseTurnOutcome =
  | {
      kind: 'completed'
      params: {
        terminal?: string
        error?: { message?: string }
        usage?: MuseTokenUsage
      }
    }
  | { kind: 'unqueued' }
  | { kind: 'terminalUnknown' }

type MuseFoldedItem = {
  kind?: string
  text?: string
  fallbackText?: string
}

type MuseTurn = {
  turnId: string
  completed: Promise<MuseTurnOutcome>
  items(): AsyncIterableIterator<MuseFoldedItem>
}

export type MuseApprovalRequest = {
  availableChoices: Array<{ choiceId: string; decision?: string }>
}

type MuseApprovalFailure = {
  kind: string
  approvalId: string
}

type MuseSessionHandle = {
  sessionId: string
  sendUserTurn(options: {
    input: Array<{ type: 'text'; text: string }>
    reasoningEffort?: LoopReasoningEffort
  }): Promise<MuseTurn>
  onApproval(handler: (request: MuseApprovalRequest) => { choiceId: string }): void
  onApprovalError(handler: (failure: MuseApprovalFailure) => void): void
}

type MuseClientHandle = {
  initializeResult?: { schema?: { fingerprint?: string } }
  startSession(options: {
    workspaceRoot: string
    modelId?: string
    approvalMode: 'allowAll'
  }): Promise<MuseSessionHandle>
  close(): Promise<void>
}

export type MuseSdkModule = {
  MuseClient: {
    spawn(options: {
      museBin: string
      args?: readonly string[]
      cwd?: string
      env?: NodeJS.ProcessEnv
      clientInfo: { name: string; version: string }
      onStderr?: (chunk: string) => void
    }): Promise<MuseClientHandle>
  }
}

class MuseRunTimeoutError extends Error {}
class MuseApprovalError extends Error {}

export function resolveMuseSessionTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[AGENT_LOOP_MUSE_TIMEOUT_MS_ENV]?.trim()
  if (!raw) return MUSE_SESSION_TIMEOUT_MS
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${AGENT_LOOP_MUSE_TIMEOUT_MS_ENV} must be a positive number of milliseconds`)
  }
  return parsed
}

function composeMusePrompt(systemPrompt: string, userPrompt: string): string {
  return `${systemPrompt}\n\n---\n\n${userPrompt}`
}

/** Unattended loops only send a server-minted approved* choiceId — never deny / first-listed. */
export function pickUnattendedApprovalChoice(request: MuseApprovalRequest): string {
  const approved = request.availableChoices.find((choice) =>
    choice.decision?.startsWith('approved'),
  )
  if (!approved?.choiceId) {
    throw new Error('Muse approval request offered no approved choiceId')
  }
  return approved.choiceId
}

function extractMuseText(items: MuseFoldedItem[]): string {
  const messages = items
    .filter((item) => item.kind === 'agentMessage')
    .map((item) => (item.text ?? item.fallbackText ?? '').trim())
    .filter(Boolean)
  const joined = messages.join('\n\n').trim()
  if (joined) return joined

  const fallback = items
    .map((item) => (item.fallbackText ?? item.text ?? '').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim()
  if (fallback) return fallback

  throw new Error('Muse turn ended without assistant text')
}

async function collectTurnItems(turn: MuseTurn): Promise<MuseFoldedItem[]> {
  const items: MuseFoldedItem[] = []
  for await (const item of turn.items()) {
    items.push(item)
  }
  return items
}

function readMuseUsage(
  usage: MuseTokenUsage | undefined,
  modelId: string,
  phase: NonNullable<MuseAgentRunOptions['phase']>,
): AgentRunResult['usage'] {
  if (!usage) return undefined
  return createUsageRecord({
    phase,
    runtime: LOOP_RUNTIME_MUSE,
    model: modelId,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: (usage.outputTokens ?? 0) + (usage.reasoningTokens ?? 0),
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  })
}

async function loadMuseSdk(): Promise<MuseSdkModule> {
  try {
    return (await import('@muse-code/sdk')) as MuseSdkModule
  } catch {
    throw new Error(
      '@muse-code/sdk is not installed. Install with: pnpm add -D @muse-code/sdk',
    )
  }
}

type OwnedMuseServe = {
  client: MuseClientHandle
  watch: SpawnedSubtreeWatch
}

async function spawnMuseClient(
  repoRoot: string,
  sdk: MuseSdkModule,
  verbose: boolean,
): Promise<OwnedMuseServe> {
  const stderrChunks: string[] = []
  const before = listChildPids(process.pid)
  try {
    const client = await sdk.MuseClient.spawn({
      museBin: 'muse',
      args: ['serve'],
      cwd: repoRoot,
      env: { ...process.env },
      clientInfo: {
        name: 'agent_looper',
        version: readPackageVersion() ?? '0.0.0',
      },
      onStderr: (chunk) => {
        stderrChunks.push(chunk)
        if (verbose) process.stderr.write(chunk)
      },
    })
    const fingerprint = client.initializeResult?.schema?.fingerprint
    if (fingerprint) {
      console.error(`[agent-loop:muse] serve handshake schema=${fingerprint}`)
    }
    return { client, watch: watchSpawnedChildren(before) }
  } catch (err) {
    await watchSpawnedChildren(before).release()
    const detail = stderrChunks.join('').trim() || (err instanceof Error ? err.message : String(err))
    if (/\bexit(?:ed)?\s+5\b/i.test(detail) || detail.includes('experimental SDK')) {
      throw new Error(
        `Muse Code SDK host is disabled on this \`muse\` binary (exit 5). ` +
          `Upgrade Muse Code or enable the experimental MSP serve tier. ${detail}`,
      )
    }
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || /ENOENT|not found/i.test(detail)) {
      throw new Error(
        '`muse` CLI is not on PATH. Install Muse Code (https://dev.meta.ai/docs/muse-code) and retry.',
      )
    }
    throw new Error(`Failed to spawn muse serve: ${detail}`)
  }
}

async function closeMuseClient(handle: MuseClientHandle): Promise<void> {
  try {
    await handle.close()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop:muse] close failed (non-blocking): ${message}`)
  }
}

async function releaseMuseServe(owned: OwnedMuseServe): Promise<void> {
  try {
    await closeMuseClient(owned.client)
  } finally {
    await owned.watch.release()
  }
}

/** Local `muse serve` handshake only — no model turn. Used by `agent-check muse`. */
export async function probeMuseServeHandshake(repoRoot: string): Promise<{ fingerprint?: string }> {
  await assertPosixShell()
  const sdk = await loadMuseSdk()
  const owned = await spawnMuseClient(repoRoot, sdk, false)
  try {
    return { fingerprint: owned.client.initializeResult?.schema?.fingerprint }
  } finally {
    await releaseMuseServe(owned)
  }
}

export async function createMuseLoopSession(ctx: RepoContext): Promise<MuseLoopSession> {
  await assertPosixShell()
  const systemPrompt = buildLoopSystemPrompt(ctx)
  const sdk = await loadMuseSdk()
  const verboseSpawn = process.env.AGENT_LOOP_VERBOSE === '1'
  let owned = await spawnMuseClient(ctx.repoRoot, sdk, verboseSpawn)
  let closed = false

  async function ensureClosed(): Promise<void> {
    if (closed) return
    closed = true
    await releaseMuseServe(owned)
  }

  return {
    async runPrompt(prompt, options) {
      const phase = options.phase ?? 'implement'
      const timeoutMs = resolveMuseSessionTimeoutMs()

      console.error(`[agent-loop:muse] model=${options.modelId} cwd=${ctx.repoRoot}`)

      const session = await owned.client.startSession({
        workspaceRoot: ctx.repoRoot,
        modelId: options.modelId,
        approvalMode: 'allowAll',
      })

      session.onApproval((request) => ({
        choiceId: pickUnattendedApprovalChoice(request),
      }))

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new MuseRunTimeoutError(`Muse session timed out after ${timeoutMs}ms`))
          }, timeoutMs)
          timeoutHandle.unref?.()
        })

        const approvalFailed = new Promise<never>((_, reject) => {
          session.onApprovalError((failure) => {
            reject(
              new MuseApprovalError(
                `Muse approval ${failure.kind} approvalId=${failure.approvalId}`,
              ),
            )
          })
        })

        const turn = await session.sendUserTurn({
          input: [{ type: 'text', text: composeMusePrompt(systemPrompt, prompt) }],
          ...(options.reasoningEffort ? { reasoningEffort: options.reasoningEffort } : {}),
        })

        const outcome = await Promise.race([turn.completed, timeout, approvalFailed])

        if (outcome.kind === 'unqueued') {
          throw new Error('Muse turn was unqueued before it ran')
        }
        if (outcome.kind === 'terminalUnknown') {
          throw new Error('Muse host died before the turn completed')
        }
        if (outcome.params.terminal === 'failed') {
          throw new Error(
            `Muse turn failed: ${outcome.params.error?.message ?? outcome.params.terminal}`,
          )
        }

        const items = await collectTurnItems(turn)
        const text = extractMuseText(items)
        emitAssistantText(options, `${text}\n`)

        const usage = readMuseUsage(outcome.params.usage, options.modelId, phase)
        if (usage) {
          console.error(
            `[agent-loop:muse] usage in=${usage.inputTokens} out=${usage.outputTokens} ~$${usage.costUsd.toFixed(4)} (${usage.costSource})`,
          )
        }

        return {
          text,
          usage,
          innerAgent: resolveInnerAgentStatus(text, 'muse'),
          sessionRef: { provider: 'muse', sessionId: session.sessionId },
          toolSummary: options.collector?.toolSummary,
          transcriptEvents: options.collector?.events,
        }
      } catch (err) {
        if (err instanceof MuseRunTimeoutError || err instanceof MuseApprovalError) {
          await ensureClosed()
        }
        throw err
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    },
    async recycle() {
      console.error('[agent-loop:muse] recycling muse serve')
      await ensureClosed()
      closed = false
      owned = await spawnMuseClient(ctx.repoRoot, sdk, verboseSpawn)
    },
    async dispose() {
      await ensureClosed()
    },
  }
}

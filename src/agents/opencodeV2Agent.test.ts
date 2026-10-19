import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { StreamCollector } from '../stream/streamCollect.js'

const closeServe = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const untrack = vi.hoisted(() => vi.fn())
const reaperClose = vi.hoisted(() => vi.fn())
const bootstrapOpencodeV2ProviderAuth = vi.hoisted(() => vi.fn(async () => ['opencode-go'] as string[]))
const openCodeMake = vi.hoisted(() => vi.fn())

vi.mock('./shellPreflight.js', () => ({
  assertPosixShell: vi.fn(async () => undefined),
}))

vi.mock('./opencodeSkillPreflight.js', () => ({
  assertOpencodeAgentSkillsReadable: vi.fn(),
  opencodeDanglingSkillHint: () => '',
}))

vi.mock('./loopSystemPrompt.js', () => ({
  buildLoopSystemPrompt: () => 'loop-system',
}))

vi.mock('./opencodeServe.js', () => ({
  reserveFreePort: async () => 4096,
  startOpencodeServe: vi.fn(async () => ({
    url: 'http://127.0.0.1:4096',
    pid: 42,
    close: closeServe,
  })),
}))

vi.mock('./processTree.js', () => ({
  trackSpawnedRoot: () => untrack,
  spawnParentDeathReaper: () => ({ pid: 7, close: reaperClose }),
}))

vi.mock('./opencodeAuth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./opencodeAuth.js')>()
  return {
    ...actual,
    bootstrapOpencodeV2ProviderAuth,
  }
})

vi.mock('@opencode/client', () => ({
  OpenCode: { make: (...args: unknown[]) => openCodeMake(...args) },
}))

import { createOpencodeV2LoopSession } from './opencodeV2Agent.js'
import { startOpencodeServe } from './opencodeServe.js'

function buildMockClient(overrides: {
  events?: Array<{ type: string; data?: Record<string, unknown> }>
  promptReject?: Error
  assistantMessage?: {
    type: string
    content: Array<{ type: string; text?: string }>
    error?: { type?: string; message?: string }
  }
  sessionTokens?: { input?: number; output?: number; cache?: { read?: number; write?: number } }
  sessionCost?: number
} = {}) {
  const events = overrides.events ?? [
    { type: 'server.connected' },
    { type: 'session.execution.succeeded', data: { sessionID: 'ses_test' } },
  ]
  const permissionEvents: Array<{ type: string; data: Record<string, unknown> }> = [
    { type: 'permission.asked', data: { id: 'perm-1', sessionID: 'ses_perm' } },
  ]

  let subscribeCall = 0
  const eventSubscribe = vi.fn(({ signal }: { signal?: AbortSignal }) => {
    subscribeCall += 1
    const isPermissionLoop = subscribeCall === 1
    const queue = isPermissionLoop ? [...permissionEvents] : [...events]
    return {
      [Symbol.asyncIterator]() {
        return {
          async next() {
            if (signal?.aborted) return { done: true, value: undefined }
            const value = queue.shift()
            if (!value) {
              if (isPermissionLoop) {
                await new Promise(() => {
                  /* permission loop blocks until abort */
                })
              }
              return { done: true, value: undefined }
            }
            return { done: false, value }
          },
        }
      },
    }
  })

  const permissionReply = vi.fn().mockResolvedValue(undefined)
  const sessionCreate = vi.fn().mockResolvedValue({ id: 'ses_test' })
  const instructionsPut = vi.fn().mockResolvedValue(undefined)
  const sessionPrompt = overrides.promptReject
    ? vi.fn().mockRejectedValue(overrides.promptReject)
    : vi.fn().mockResolvedValue(undefined)
  const sessionInterrupt = vi.fn().mockResolvedValue(undefined)
  const sessionRemove = vi.fn().mockResolvedValue(undefined)
  const messageList = vi.fn().mockResolvedValue({
    data: [
      overrides.assistantMessage ?? {
        type: 'assistant',
        content: [{ type: 'text', text: 'done' }],
      },
    ],
  })
  const sessionGet = vi.fn().mockResolvedValue({
    tokens: overrides.sessionTokens ?? { input: 10, output: 5, cache: { read: 1, write: 0 } },
    cost: overrides.sessionCost ?? 0.01,
  })

  const client = {
    event: { subscribe: (opts: { signal?: AbortSignal }) => eventSubscribe(opts) },
    permission: { reply: permissionReply },
    session: {
      create: sessionCreate,
      prompt: sessionPrompt,
      interrupt: sessionInterrupt,
      remove: sessionRemove,
      get: sessionGet,
      instructions: { entry: { put: instructionsPut } },
    },
    message: { list: messageList },
  }

  openCodeMake.mockReturnValue(client)
  return {
    client,
    sessionCreate,
    sessionPrompt,
    permissionReply,
    instructionsPut,
    messageList,
    sessionGet,
  }
}

const baseInput = {
  command: '/bin/opencode',
  servePath: '/bin',
  serveConfig: { autoupdate: false },
  restorePath: vi.fn(),
}

describe('createOpencodeV2LoopSession', () => {
  beforeEach(() => {
    closeServe.mockClear()
    untrack.mockClear()
    reaperClose.mockClear()
    bootstrapOpencodeV2ProviderAuth.mockClear()
    bootstrapOpencodeV2ProviderAuth.mockResolvedValue(['opencode-go'])
    openCodeMake.mockReset()
    vi.mocked(startOpencodeServe).mockResolvedValue({
      url: 'http://127.0.0.1:4096',
      pid: 42,
      close: closeServe,
    })
    vi.stubEnv('OPENCODE_API_KEY', 'test-go-key')
  })

  it('releases serve when the server fails to start', async () => {
    vi.mocked(startOpencodeServe).mockRejectedValueOnce(new Error('spawn ENOENT'))
    await expect(
      createOpencodeV2LoopSession(
        { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
        baseInput,
      ),
    ).rejects.toThrow(/Failed to start OpenCode 2\.x server/)
    expect(baseInput.restorePath).toHaveBeenCalled()
  })

  it('runs a prompt through the 2.x client and returns usage', async () => {
    const mocks = buildMockClient()
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )

    const collector = new StreamCollector()
    const result = await session.runPrompt('fix tests', {
      modelId: 'opencode-go/kimi-k3',
      phase: 'implement',
      collector,
    })

    expect(result.text).toBe('done')
    expect(result.usage?.inputTokens).toBe(10)
    expect(result.innerAgent).toBeDefined()
    expect(mocks.sessionCreate).toHaveBeenCalled()
    expect(mocks.instructionsPut).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'agent-loop', value: 'loop-system' }),
    )
    await session.dispose()
    expect(reaperClose).toHaveBeenCalled()
    expect(closeServe).toHaveBeenCalled()
    expect(baseInput.restorePath).toHaveBeenCalled()
  })

  it('auto-approves permission.asked events on the background subscription', async () => {
    const mocks = buildMockClient()
    await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await new Promise((r) => setTimeout(r, 20))
    expect(mocks.permissionReply).toHaveBeenCalledWith({
      sessionID: 'ses_perm',
      requestID: 'perm-1',
      decision: 'always',
    })
  })

  it('wraps prompt failures with provider context', async () => {
    buildMockClient({ promptReject: new Error('provider down') })
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/provider=opencode-go/)
  })

  it('surfaces turn errors from session.execution', async () => {
    buildMockClient({
      events: [
        { type: 'server.connected' },
        {
          type: 'session.execution.failed',
          data: {
            sessionID: 'ses_test',
            error: { type: 'provider.no-route', message: 'no model' },
          },
        },
      ],
    })
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/provider\.no-route/)
  })

  it('throws when no assistant message is returned', async () => {
    const mocks = buildMockClient()
    mocks.messageList.mockResolvedValue({ data: [] })
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/without an assistant message/)
  })

  it('throws when the assistant row carries an error', async () => {
    buildMockClient({
      assistantMessage: {
        type: 'assistant',
        content: [],
        error: { type: 'ToolError', message: 'skill missing' },
      },
    })
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/OpenCode assistant error/)
  })

  it('throws when assistant text is empty', async () => {
    buildMockClient({
      assistantMessage: { type: 'assistant', content: [{ type: 'text', text: '   ' }] },
    })
    const session = await createOpencodeV2LoopSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/without assistant text/)
  })
})

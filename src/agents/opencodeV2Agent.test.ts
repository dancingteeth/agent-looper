import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { StreamCollector } from '../stream/streamCollect.js'

const closeServe = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const untrack = vi.hoisted(() => vi.fn())
const reaperClose = vi.hoisted(() => vi.fn())
const bootstrapOpencodeV2ProviderAuth = vi.hoisted(() => vi.fn(async () => ['opencode-go'] as string[]))
const openCodeMake = vi.hoisted(() => vi.fn())
const opencodeClientInstall = vi.hoisted(() => ({ missing: false }))

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
  get OpenCode() {
    if (opencodeClientInstall.missing) {
      throw new Error("Cannot find package '@opencode/client'")
    }
    return { make: (...args: unknown[]) => openCodeMake(...args) }
  },
}))

import {
  autoApproveV2Permissions,
  createOpencodeV2LoopSession,
  subscribeConnected,
} from './opencodeV2Agent.js'
import type { OpencodeLoopSession } from './opencodeAgent.js'
import { startOpencodeServe } from './opencodeServe.js'

function buildMockClient(overrides: {
  events?: Array<{ type: string; data?: Record<string, unknown> }>
  promptReject?: Error
  permissionReplyReject?: Error
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

  const permissionReply = overrides.permissionReplyReject
    ? vi.fn().mockRejectedValue(overrides.permissionReplyReject)
    : vi.fn().mockResolvedValue(undefined)
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

function makeBaseInput() {
  return {
    command: '/bin/opencode',
    servePath: '/bin',
    serveConfig: { autoupdate: false },
    restorePath: vi.fn(),
  }
}

describe('createOpencodeV2LoopSession', () => {
  const openSessions: OpencodeLoopSession[] = []
  let stderrSpy: ReturnType<typeof vi.spyOn> | undefined

  async function openSession(
    ...args: Parameters<typeof createOpencodeV2LoopSession>
  ): Promise<OpencodeLoopSession> {
    const session = await createOpencodeV2LoopSession(...args)
    openSessions.push(session)
    return session
  }

  beforeEach(() => {
    opencodeClientInstall.missing = false
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

  afterEach(async () => {
    while (openSessions.length > 0) {
      const session = openSessions.pop()
      await session?.dispose().catch(() => undefined)
    }
    stderrSpy?.mockRestore()
    stderrSpy = undefined
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('releases serve when the server fails to start', async () => {
    const baseInput = makeBaseInput()
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
    const baseInput = makeBaseInput()
    const mocks = buildMockClient()
    const session = await openSession(
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
    openSessions.pop()
    expect(reaperClose).toHaveBeenCalled()
    expect(closeServe).toHaveBeenCalled()
    expect(baseInput.restorePath).toHaveBeenCalled()
  })

  it('auto-approves permission.asked events on the background subscription', async () => {
    const baseInput = makeBaseInput()
    const mocks = buildMockClient()
    await openSession({ repoRoot: '/repo', profile: repoProfileSchema.parse({}) }, baseInput)
    await vi.waitFor(() => {
      expect(mocks.permissionReply).toHaveBeenCalledWith({
        sessionID: 'ses_perm',
        requestID: 'perm-1',
        decision: 'always',
      })
    })
  })

  it('logs and continues when permission reply fails', async () => {
    const baseInput = makeBaseInput()
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    buildMockClient({ permissionReplyReject: new Error('permission API 500') })
    await openSession({ repoRoot: '/repo', profile: repoProfileSchema.parse({}) }, baseInput)
    await vi.waitFor(() => {
      expect(
        stderrSpy!.mock.calls.some((c: unknown[]) => String(c[0]).includes('permission reply failed')),
      ).toBe(
        true,
      )
    })
  })

  it('throws when @opencode/client is not installed', async () => {
    const baseInput = makeBaseInput()
    opencodeClientInstall.missing = true
    await expect(
      createOpencodeV2LoopSession({ repoRoot: '/repo', profile: repoProfileSchema.parse({}) }, baseInput),
    ).rejects.toThrow(/Runtime "opencode" needs @opencode\/client/)
    expect(baseInput.restorePath).toHaveBeenCalled()
    opencodeClientInstall.missing = false
  })

  it('releases serve when provider auth bootstrap fails after connect', async () => {
    const baseInput = makeBaseInput()
    bootstrapOpencodeV2ProviderAuth.mockRejectedValueOnce(new Error('credential store down'))
    buildMockClient()
    await expect(
      createOpencodeV2LoopSession({ repoRoot: '/repo', profile: repoProfileSchema.parse({}) }, baseInput),
    ).rejects.toThrow(/credential store down/)
    expect(reaperClose).toHaveBeenCalled()
    expect(closeServe).toHaveBeenCalled()
  })

  it('forwards a non-server.connected first event into the turn stream', async () => {
    const baseInput = makeBaseInput()
    buildMockClient({
      events: [
        { type: 'session.status', data: { sessionID: 'ses_test', status: { type: 'busy' } } },
        { type: 'session.execution.succeeded', data: { sessionID: 'ses_test' } },
      ],
    })
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    const result = await session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' })
    expect(result.text).toBe('done')
  })

  it('logs heartbeats while waiting for session.execution', async () => {
    vi.useFakeTimers()
    const baseInput = makeBaseInput()
    let releaseExec: (() => void) | undefined
    const execGate = new Promise<void>((resolve) => {
      releaseExec = resolve
    })
    const turnEvents = [
      { type: 'server.connected' as const },
      { type: 'session.execution.succeeded' as const, data: { sessionID: 'ses_test' } },
    ]
    let subscribeCall = 0
    openCodeMake.mockReturnValue({
      event: {
        subscribe: () => {
          subscribeCall += 1
          const isPermission = subscribeCall === 1
          if (isPermission) {
            return {
              async *[Symbol.asyncIterator]() {
                yield { type: 'permission.asked', data: { id: 'p1', sessionID: 's1' } }
                await new Promise(() => undefined)
              },
            }
          }
          return {
            async *[Symbol.asyncIterator]() {
              yield turnEvents[0]
              await execGate
              yield turnEvents[1]
            },
          }
        },
      },
      permission: { reply: vi.fn().mockResolvedValue(undefined) },
      session: {
        create: vi.fn().mockResolvedValue({ id: 'ses_test' }),
        prompt: vi.fn().mockResolvedValue(undefined),
        interrupt: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue({
          tokens: { input: 1, output: 1, cache: { read: 0, write: 0 } },
          cost: 0,
        }),
        instructions: { entry: { put: vi.fn().mockResolvedValue(undefined) } },
      },
      message: {
        list: vi.fn().mockResolvedValue({
          data: [{ type: 'assistant', content: [{ type: 'text', text: 'ok' }] }],
        }),
      },
    })
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    const pending = session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(
      stderrSpy!.mock.calls.some((c: unknown[]) => String(c[0]).includes('still working session=ses_test')),
    ).toBe(
      true,
    )
    releaseExec?.()
    await pending
  })

  it('wraps prompt failures with provider context', async () => {
    const baseInput = makeBaseInput()
    buildMockClient({ promptReject: new Error('provider down') })
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/provider=opencode-go/)
  })

  it('surfaces turn errors from session.execution', async () => {
    const baseInput = makeBaseInput()
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
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/provider\.no-route/)
  })

  it('throws when no assistant message is returned', async () => {
    const baseInput = makeBaseInput()
    const mocks = buildMockClient()
    mocks.messageList.mockResolvedValue({ data: [] })
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/without an assistant message/)
  })

  it('throws when the assistant row carries an error', async () => {
    const baseInput = makeBaseInput()
    buildMockClient({
      assistantMessage: {
        type: 'assistant',
        content: [],
        error: { type: 'ToolError', message: 'skill missing' },
      },
    })
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/OpenCode assistant error/)
  })

  it('throws when assistant text is empty', async () => {
    const baseInput = makeBaseInput()
    buildMockClient({
      assistantMessage: { type: 'assistant', content: [{ type: 'text', text: '   ' }] },
    })
    const session = await openSession(
      { repoRoot: '/repo', profile: repoProfileSchema.parse({}) },
      baseInput,
    )
    await expect(
      session.runPrompt('x', { modelId: 'opencode-go/kimi-k3', phase: 'implement' }),
    ).rejects.toThrow(/without assistant text/)
  })
})

describe('subscribeConnected', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('yields events after a non-server.connected first frame', async () => {
    const client = {
      event: {
        subscribe: () => ({
          [Symbol.asyncIterator]: () => {
            const frames = [
              { type: 'session.status', data: { sessionID: 's1' } },
              { type: 'server.connected' },
            ]
            return {
              async next() {
                const value = frames.shift()
                if (!value) return { done: true, value: undefined }
                return { done: false, value }
              },
            }
          },
        }),
      },
    }
    const events = []
    for await (const event of await subscribeConnected(client as never, new AbortController().signal)) {
      events.push(event)
    }
    expect(events.map((e) => e.type)).toEqual(['session.status', 'server.connected'])
  })

  it('returns immediately when the stream ends before the first event', async () => {
    const client = {
      event: {
        subscribe: () => ({
          [Symbol.asyncIterator]: () => ({
            next: async () => ({ done: true, value: undefined }),
          }),
        }),
      },
    }
    const events = []
    for await (const event of await subscribeConnected(client as never, new AbortController().signal)) {
      events.push(event)
    }
    expect(events).toEqual([])
  })
})

describe('autoApproveV2Permissions', () => {
  it('ignores non-permission events and approves permission.asked', async () => {
    const reply = vi.fn().mockResolvedValue(undefined)
    const client = {
      event: {
        subscribe: () => ({
          async *[Symbol.asyncIterator]() {
            yield { type: 'server.connected' }
            yield { type: 'permission.asked', data: { id: 'perm-9', sessionID: 'ses-9' } }
          },
        }),
      },
      permission: { reply },
    }
    const abort = new AbortController()
    autoApproveV2Permissions(client as never, abort.signal)
    await vi.waitFor(() => {
      expect(reply).toHaveBeenCalledWith({
        sessionID: 'ses-9',
        requestID: 'perm-9',
        decision: 'always',
      })
    })
    abort.abort()
  })
})

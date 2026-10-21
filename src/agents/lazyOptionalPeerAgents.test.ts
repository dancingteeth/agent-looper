import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { loopConfigSchema } from '../loop/loopConfig.js'

const mockClineCreate = vi.fn()
const mockAgentCreate = vi.fn()

vi.mock('@cline/sdk', () => ({
  ClineCore: {
    create: (...args: unknown[]) => mockClineCreate(...args),
  },
}))

vi.mock('@cursor/sdk', () => ({
  Agent: {
    create: (...args: unknown[]) => mockAgentCreate(...args),
  },
  CursorAgentError: class CursorAgentError extends Error {
    readonly name = 'CursorAgentError'
  },
  JsonlLocalAgentStore: vi.fn(),
}))

vi.mock('./shellPreflight.js', () => ({
  assertPosixShell: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./processTree.js', () => ({
  listChildPids: vi.fn(() => []),
  watchSpawnedChildren: vi.fn(() => ({
    pids: [],
    adopt: vi.fn(),
    release: vi.fn().mockResolvedValue(undefined),
  })),
  withSpawnedChildrenPoll: vi.fn(async (_watch: unknown, work: () => Promise<unknown>) => work()),
}))

vi.mock('../stream/streamRun.js', () => ({
  printRunStream: vi.fn().mockResolvedValue(undefined),
}))

const testCtx = {
  repoRoot: process.cwd(),
  profile: repoProfileSchema.parse({ clientName: 'lazy-peer-test' }),
}

function mockCursorAgentSession() {
  mockAgentCreate.mockResolvedValue({
    send: vi.fn().mockResolvedValue({
      id: 'run-1',
      agentId: 'agent-1',
      stream: () => ({
        async next() {
          return { done: true, value: undefined }
        },
        [Symbol.asyncIterator]() {
          return this
        },
      }),
      wait: vi.fn().mockResolvedValue({
        status: 'completed',
        result: 'cursor lazy ok',
        usage: undefined,
      }),
      cancel: vi.fn().mockResolvedValue(undefined),
    }),
    [Symbol.asyncDispose]: vi.fn().mockResolvedValue(undefined),
  })
}

describe('lazy optional peer loads at runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CURSOR_API_KEY', 'test-cursor-key')
    vi.stubEnv('CLINE_API_KEY', 'test-cline-key')
    mockCursorAgentSession()
    mockClineCreate.mockResolvedValue({
      start: vi.fn().mockResolvedValue({
        sessionId: 'cline-sess',
        result: { text: 'cline lazy ok' },
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      getAccumulatedUsage: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('createLoopAgentSession(cursor) loads @cursor/sdk via dynamic import', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    const session = await createLoopAgentSession(config, testCtx)

    const result = await session.runIterationPrompt(
      'hello',
      { runtime: 'cursor', model: 'composer-2.5' },
      { assistantOutput: 'none' },
    )

    expect(mockAgentCreate).toHaveBeenCalled()
    expect(result.text).toBe('cursor lazy ok')
    await session.dispose()
  })

  it('runOneShotAgentPrompt(cursor) loads cursorAgent without a static peer import', async () => {
    const { runOneShotAgentPrompt } = await import('./oneShotAgentRun.js')
    const result = await runOneShotAgentPrompt(
      testCtx,
      'review',
      { runtime: 'cursor', model: 'grok-4.7' },
      { phase: 'review' },
    )

    expect(mockAgentCreate).toHaveBeenCalled()
    expect(result.text).toBe('cursor lazy ok')
  })

  it('createLoopAgentSession(cline-pass) loads @cline/sdk via dynamic import', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cline-pass' })
    const session = await createLoopAgentSession(config, testCtx)

    const result = await session.runIterationPrompt(
      'hello',
      { runtime: 'cline-pass', model: 'cline-pass/deepseek-v4-flash' },
      { assistantOutput: 'none' },
    )

    expect(mockClineCreate).toHaveBeenCalledWith({
      clientName: 'lazy-peer-test',
      backendMode: 'local',
    })
    expect(result.text).toBe('cline lazy ok')
    await session.dispose()
  })
})

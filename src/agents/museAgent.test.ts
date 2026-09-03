import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import {
  AGENT_LOOP_MUSE_TIMEOUT_MS_ENV,
  createMuseLoopSession,
  pickUnattendedApprovalChoice,
  probeMuseServeHandshake,
  resolveMuseSessionTimeoutMs,
  MUSE_SESSION_TIMEOUT_MS,
} from './museAgent.js'

const { watchRelease, watchSpawnedChildren, listChildPids } = vi.hoisted(() => {
  const watchRelease = vi.fn().mockResolvedValue(undefined)
  const watchSpawnedChildren = vi.fn(() => ({
    pids: [42],
    adopt: vi.fn(),
    release: watchRelease,
  }))
  const listChildPids = vi.fn(() => [] as number[])
  return { watchRelease, watchSpawnedChildren, listChildPids }
})

vi.mock('./processTree.js', () => ({
  listChildPids,
  watchSpawnedChildren,
}))

const { spawn, startSession, sendUserTurn, close, onApproval, onApprovalError } = vi.hoisted(() => {
  const sendUserTurn = vi.fn()
  const onApproval = vi.fn()
  const onApprovalError = vi.fn()
  const startSession = vi.fn()
  const close = vi.fn().mockResolvedValue(undefined)
  const spawn = vi.fn()
  return { spawn, startSession, sendUserTurn, close, onApproval, onApprovalError }
})

vi.mock('@muse-code/sdk', () => ({
  MuseClient: { spawn },
}))

vi.mock('./shellPreflight.js', () => ({
  assertPosixShell: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./loopSystemPrompt.js', () => ({
  buildLoopSystemPrompt: vi.fn().mockReturnValue('SYSTEM'),
}))

const testCtx = {
  repoRoot: '/repo',
  profile: repoProfileSchema.parse({}),
}

function completedTurn(text: string, terminal = 'success') {
  return {
    turnId: 'turn-1',
    completed: Promise.resolve({
      kind: 'completed' as const,
      params: {
        terminal,
        error: terminal === 'failed' ? { message: 'boom' } : undefined,
        usage: {
          inputTokens: 12,
          outputTokens: 4,
          reasoningTokens: 1,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
        },
      },
    }),
    async *items() {
      yield { kind: 'agentMessage', text }
    },
  }
}

function hangingTurn() {
  return {
    turnId: 'turn-hang',
    completed: new Promise<never>(() => undefined),
    async *items() {
      /* never */
    },
  }
}

describe('pickUnattendedApprovalChoice', () => {
  it('prefers an approved decision over the first choice', () => {
    expect(
      pickUnattendedApprovalChoice({
        availableChoices: [
          { choiceId: 'deny-1', decision: 'denied' },
          { choiceId: 'allow-1', decision: 'approvedForSession' },
        ],
      }),
    ).toBe('allow-1')
  })

  it('fails closed when no approved choice exists', () => {
    expect(() =>
      pickUnattendedApprovalChoice({
        availableChoices: [{ choiceId: 'deny-1', decision: 'denied' }],
      }),
    ).toThrow(/no approved choiceId/)
    expect(() => pickUnattendedApprovalChoice({ availableChoices: [] })).toThrow(
      /no approved choiceId/,
    )
  })
})

describe('resolveMuseSessionTimeoutMs', () => {
  it('defaults to 45m and rejects non-positive env', () => {
    expect(resolveMuseSessionTimeoutMs({})).toBe(MUSE_SESSION_TIMEOUT_MS)
    expect(resolveMuseSessionTimeoutMs({ [AGENT_LOOP_MUSE_TIMEOUT_MS_ENV]: '120000' })).toBe(120000)
    expect(() => resolveMuseSessionTimeoutMs({ [AGENT_LOOP_MUSE_TIMEOUT_MS_ENV]: '0' })).toThrow(
      AGENT_LOOP_MUSE_TIMEOUT_MS_ENV,
    )
  })
})

describe('createMuseLoopSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    watchRelease.mockResolvedValue(undefined)
    listChildPids.mockReturnValue([])
    watchSpawnedChildren.mockImplementation(() => ({
      pids: [42],
      adopt: vi.fn(),
      release: watchRelease,
    }))
    close.mockResolvedValue(undefined)
    sendUserTurn.mockResolvedValue(completedTurn('hello from muse'))
    onApprovalError.mockImplementation(() => undefined)
    startSession.mockResolvedValue({
      sessionId: 'sess-1',
      sendUserTurn,
      onApproval,
      onApprovalError,
    })
    spawn.mockResolvedValue({
      initializeResult: { schema: { fingerprint: 'fp-test' } },
      startSession,
      close,
    })
  })

  afterEach(() => {
    delete process.env[AGENT_LOOP_MUSE_TIMEOUT_MS_ENV]
  })

  it('spawns muse serve, auto-approves, and runs a fresh session per turn', async () => {
    const session = await createMuseLoopSession(testCtx)
    const result = await session.runPrompt('do the thing', {
      modelId: 'muse-spark-1.3-contributor',
      assistantOutput: 'none',
      phase: 'implement',
      reasoningEffort: 'high',
    })

    expect(result.text).toBe('hello from muse')
    expect(result.sessionRef).toEqual({ provider: 'muse', sessionId: 'sess-1' })
    expect(result.usage?.runtime).toBe('muse')
    expect(result.usage?.inputTokens).toBe(12)
    expect(result.usage?.outputTokens).toBe(5)
    expect(spawn).toHaveBeenCalledWith(
      expect.objectContaining({
        museBin: 'muse',
        args: ['serve'],
        cwd: '/repo',
        clientInfo: expect.objectContaining({
          name: 'agent_looper',
        }),
      }),
    )
    expect(spawn.mock.calls[0][0].clientInfo.name).toMatch(/^[a-z0-9_]+$/)
    expect(startSession).toHaveBeenCalledWith({
      workspaceRoot: '/repo',
      modelId: 'muse-spark-1.3-contributor',
      approvalMode: 'allowAll',
    })
    expect(onApproval).toHaveBeenCalledOnce()
    expect(sendUserTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        reasoningEffort: 'high',
        input: [{ type: 'text', text: expect.stringContaining('do the thing') }],
      }),
    )

    await session.runPrompt('second turn', {
      modelId: 'muse-spark-1.3-contributor',
      assistantOutput: 'none',
    })
    expect(startSession).toHaveBeenCalledTimes(2)
    await session.dispose()
    expect(close).toHaveBeenCalledOnce()
    expect(watchRelease).toHaveBeenCalledOnce()
  })

  it('recycles by closing the host and spawning again', async () => {
    const session = await createMuseLoopSession(testCtx)
    await session.recycle()
    expect(close).toHaveBeenCalledOnce()
    expect(spawn).toHaveBeenCalledTimes(2)
    await session.dispose()
    expect(close).toHaveBeenCalledTimes(2)
    expect(watchRelease).toHaveBeenCalledTimes(2)
  })

  it('throws when the turn terminal is failed', async () => {
    sendUserTurn.mockResolvedValue(completedTurn('nope', 'failed'))
    const session = await createMuseLoopSession(testCtx)
    await expect(
      session.runPrompt('do the thing', {
        modelId: 'muse-spark-1.3-contributor',
        assistantOutput: 'none',
      }),
    ).rejects.toThrow('Muse turn failed: boom')
    await session.dispose()
  })

  it('maps spawn exit 5 to a closed SDK-host error', async () => {
    spawn.mockRejectedValue(new Error('process exited 5'))
    await expect(createMuseLoopSession(testCtx)).rejects.toThrow(/exit 5/)
    expect(watchRelease).toHaveBeenCalledOnce()
  })

  it('kills the host when the turn wall clock fires', async () => {
    process.env[AGENT_LOOP_MUSE_TIMEOUT_MS_ENV] = '20'
    sendUserTurn.mockResolvedValue(hangingTurn())
    const session = await createMuseLoopSession(testCtx)
    await expect(
      session.runPrompt('do the thing', {
        modelId: 'muse-spark-1.3-contributor',
        assistantOutput: 'none',
      }),
    ).rejects.toThrow(/timed out after 20ms/)
    expect(close).toHaveBeenCalledOnce()
    await session.dispose()
    expect(close).toHaveBeenCalledOnce()
  })

  it('kills the host when approval decide fails', async () => {
    onApprovalError.mockImplementation(
      (handler: (failure: { kind: string; approvalId: string }) => void) => {
        queueMicrotask(() => handler({ kind: 'submitFailed', approvalId: 'ap-1' }))
      },
    )
    sendUserTurn.mockResolvedValue(hangingTurn())
    const session = await createMuseLoopSession(testCtx)
    await expect(
      session.runPrompt('do the thing', {
        modelId: 'muse-spark-1.3-contributor',
        assistantOutput: 'none',
      }),
    ).rejects.toThrow(/Muse approval submitFailed approvalId=ap-1/)
    expect(close).toHaveBeenCalledOnce()
    await session.dispose()
  })

  it('probeMuseServeHandshake spawns then closes without a turn', async () => {
    const result = await probeMuseServeHandshake('/repo')
    expect(result).toEqual({ fingerprint: 'fp-test' })
    expect(spawn).toHaveBeenCalledOnce()
    expect(startSession).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledOnce()
    expect(watchRelease).toHaveBeenCalledOnce()
  })
})

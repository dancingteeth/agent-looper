import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'

const { watchRelease, watchSpawnedChildren, listChildPids, withSpawnedChildrenPoll } = vi.hoisted(
  () => {
    const watchRelease = vi.fn().mockResolvedValue(undefined)
    const watchSpawnedChildren = vi.fn(() => ({
      pids: [] as number[],
      adopt: vi.fn(),
      release: watchRelease,
    }))
    const listChildPids = vi.fn(() => [] as number[])
    const withSpawnedChildrenPoll = vi.fn(async (_watch: unknown, work: () => Promise<unknown>) =>
      work(),
    )
    return { watchRelease, watchSpawnedChildren, listChildPids, withSpawnedChildrenPoll }
  },
)

vi.mock('./processTree.js', () => ({
  listChildPids,
  watchSpawnedChildren,
  withSpawnedChildrenPoll,
}))

const { Codex } = vi.hoisted(() => {
  const run = vi.fn()
  const startThread = vi.fn(() => ({
    id: 'thread-1',
    run,
  }))
  const Codex = vi.fn(function Codex() {
    return { startThread }
  })
  return { Codex, run, startThread }
})

vi.mock('@openai/codex-sdk', () => ({
  Codex,
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

describe('createCodexLoopSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    watchRelease.mockResolvedValue(undefined)
    listChildPids.mockReturnValue([])
    watchSpawnedChildren.mockImplementation(() => ({
      pids: [],
      adopt: vi.fn(),
      release: watchRelease,
    }))
    withSpawnedChildrenPoll.mockImplementation(async (_watch, work) => work())
    Codex.mockImplementation(function Codex() {
      return {
        startThread: vi.fn(() => ({
          id: 'thread-1',
          run: vi.fn().mockResolvedValue({
            items: [{ type: 'agent_message', text: 'hello from codex' }],
            finalResponse: 'hello from codex',
            usage: {
              input_tokens: 10,
              cached_input_tokens: 2,
              cache_write_input_tokens: 1,
              output_tokens: 5,
              reasoning_output_tokens: 0,
            },
          }),
        })),
      }
    })
  })

  it('runs a fresh thread with unattended sandbox options', async () => {
    const { createCodexLoopSession } = await import('./codexAgent.js')
    const session = await createCodexLoopSession(testCtx)
    const result = await session.runPrompt('do the thing', {
      modelId: 'gpt-5.6-luna',
      assistantOutput: 'none',
      phase: 'implement',
    })

    expect(result.text).toBe('hello from codex')
    expect(result.sessionRef).toEqual({ provider: 'codex', sessionId: 'thread-1' })
    expect(result.usage?.runtime).toBe('codex')
    expect(result.usage?.inputTokens).toBe(10)
    expect(Codex).toHaveBeenCalledOnce()

    const instance = Codex.mock.results[0]!.value as {
      startThread: ReturnType<typeof vi.fn>
    }
    expect(instance.startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.6-luna',
        workingDirectory: '/repo',
        skipGitRepoCheck: true,
        approvalPolicy: 'never',
        sandboxMode: 'workspace-write',
      }),
    )
    const thread = instance.startThread.mock.results[0]!.value as {
      run: ReturnType<typeof vi.fn>
    }
    expect(thread.run).toHaveBeenCalledWith(
      expect.stringContaining('SYSTEM'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(thread.run.mock.calls[0]![0]).toContain('do the thing')
    await session.dispose()
    expect(watchRelease).toHaveBeenCalledOnce()
  })
})

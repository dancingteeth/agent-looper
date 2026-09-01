import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { createOpencodeLoopSession, releaseOpencodeServe } from './opencodeAgent.js'

const closeServe = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
const untrack = vi.hoisted(() => vi.fn())
const reaperClose = vi.hoisted(() => vi.fn())
const bootstrapOpencodeProviderAuth = vi.hoisted(() => vi.fn())

vi.mock('./shellPreflight.js', () => ({
  assertPosixShell: vi.fn(async () => undefined),
}))

vi.mock('./opencodeSkillPreflight.js', () => ({
  assertOpencodeAgentSkillsReadable: vi.fn(),
  opencodeDanglingSkillHint: () => '',
}))

vi.mock('./loopSystemPrompt.js', () => ({
  buildLoopSystemPrompt: () => 'sys',
}))

vi.mock('./opencodeServe.js', () => ({
  pathWithLocalOpencodeBins: () => '/bin',
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
    bootstrapOpencodeProviderAuth,
  }
})

vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: () => ({
    auth: { set: vi.fn() },
    event: { subscribe: vi.fn() },
    session: {
      create: vi.fn(),
      promptAsync: vi.fn(),
      abort: vi.fn(),
      delete: vi.fn(),
      messages: vi.fn(),
    },
  }),
}))

describe('releaseOpencodeServe', () => {
  it('closes the reaper, untracks, kills the serve, then restores PATH', async () => {
    const order: string[] = []
    await releaseOpencodeServe({
      reaper: {
        close: () => {
          order.push('reaper')
        },
      },
      untrack: () => {
        order.push('untrack')
      },
      close: async () => {
        order.push('close')
      },
      restorePath: () => {
        order.push('path')
      },
    })
    expect(order).toEqual(['reaper', 'untrack', 'close', 'path'])
  })
})

describe('createOpencodeLoopSession', () => {
  beforeEach(() => {
    closeServe.mockClear()
    untrack.mockClear()
    reaperClose.mockClear()
    bootstrapOpencodeProviderAuth.mockReset()
  })

  it('releases the detached serve when auth bootstrap throws', async () => {
    bootstrapOpencodeProviderAuth.mockRejectedValue(new Error('auth.set failed'))
    await expect(
      createOpencodeLoopSession({
        repoRoot: '/repo',
        profile: repoProfileSchema.parse({}),
      }),
    ).rejects.toThrow(/auth\.set failed/)
    expect(reaperClose).toHaveBeenCalledOnce()
    expect(untrack).toHaveBeenCalledOnce()
    expect(closeServe).toHaveBeenCalledOnce()
  })
})

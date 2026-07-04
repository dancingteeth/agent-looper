import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'

const mockDispose = vi.fn().mockResolvedValue(undefined)
const mockClineCreate = vi.fn().mockResolvedValue({
  start: vi.fn().mockResolvedValue({ sessionId: 'sess-1', result: { text: 'inline result' } }),
  stop: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  dispose: mockDispose,
  subscribe: vi.fn(),
})

vi.mock('@cline/sdk', () => ({
  ClineCore: {
    create: (...args: unknown[]) => mockClineCreate(...args),
  },
}))

vi.mock('./shellPreflight.js', () => ({
  assertPosixShell: vi.fn().mockResolvedValue(undefined),
}))

describe('clineAgent', () => {
  const ctx = {
    repoRoot: process.cwd(),
    profile: repoProfileSchema.parse({ clientName: 'test-client' }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CLINE_API_KEY', 'test-key')
  })

  it('throws when CLINE_API_KEY is unset', async () => {
    vi.stubEnv('CLINE_API_KEY', '')
    const { runClineAgentPrompt } = await import('./clineAgent.js')

    await expect(
      runClineAgentPrompt(ctx, 'hello', { modelId: 'cline-pass/deepseek-v4-flash' }),
    ).rejects.toThrow(/CLINE_API_KEY/)
  })

  it('creates a Cline session with repo profile clientName', async () => {
    const { createClineLoopSession } = await import('./clineAgent.js')
    const session = await createClineLoopSession(ctx)

    expect(mockClineCreate).toHaveBeenCalledWith({
      clientName: 'test-client',
      backendMode: 'local',
    })
    expect(session.runPrompt).toBeTypeOf('function')
    expect(session.dispose).toBeTypeOf('function')
  })

  it('returns inline start result without waiting for session events', async () => {
    const { createClineLoopSession } = await import('./clineAgent.js')
    const session = await createClineLoopSession(ctx)

    const text = await session.runPrompt('do work', {
      modelId: 'cline-pass/deepseek-v4-flash',
      assistantOutput: 'none',
    })

    expect(text).toBe('inline result')
  })
})

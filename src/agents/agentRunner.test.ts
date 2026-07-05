import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { loopConfigSchema } from '../loop/loopConfig.js'

const runCursorAgentPrompt = vi.fn()
const createClineLoopSession = vi.fn()

vi.mock('./cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('./clineAgent.js', () => ({
  createClineLoopSession,
}))

const testCtx = {
  repoRoot: '/repo',
  profile: repoProfileSchema.parse({}),
}

describe('createLoopAgentSession', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    runCursorAgentPrompt.mockResolvedValue({ text: 'cursor-ok' })
    createClineLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'cline-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('dispatches cursor runtime to runCursorAgentPrompt', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    const session = await createLoopAgentSession(config, testCtx)

    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'cursor', model: 'composer-2.5' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('cursor-ok')
    expect(runCursorAgentPrompt).toHaveBeenCalledOnce()
    expect(createClineLoopSession).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('dispatches cline-pass runtime to Cline session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cline-pass' })
    const clineSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'cline-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createClineLoopSession.mockResolvedValue(clineSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'cline-pass', model: 'cline-pass/deepseek-v4-flash' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('cline-ok')
    expect(createClineLoopSession).toHaveBeenCalledOnce()
    expect(runCursorAgentPrompt).not.toHaveBeenCalled()
    expect(clineSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({ modelId: 'cline-pass/deepseek-v4-flash' }),
    )
    await session.dispose()
    expect(clineSession.dispose).toHaveBeenCalledOnce()
  })
})

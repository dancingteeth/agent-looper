import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { loopConfigSchema } from '../loop/loopConfig.js'

const runCursorAgentPrompt = vi.fn()
const createClineLoopSession = vi.fn()
const createOpencodeLoopSession = vi.fn()

vi.mock('./cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('./clineAgent.js', () => ({
  createClineLoopSession,
}))

vi.mock('./opencodeAgent.js', () => ({
  createOpencodeLoopSession,
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
    createOpencodeLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'opencode-ok' }),
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
    expect(createOpencodeLoopSession).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('does not load Cline or OpenCode session factory for cursor runtime', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    await createLoopAgentSession(config, testCtx)
    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(createOpencodeLoopSession).not.toHaveBeenCalled()
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
    expect(createOpencodeLoopSession).not.toHaveBeenCalled()
    expect(clineSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'cline-pass/deepseek-v4-flash',
        providerId: 'cline-pass',
      }),
    )
    await session.dispose()
    expect(clineSession.dispose).toHaveBeenCalledOnce()
  })

  it('dispatches opencode runtime to OpenCode session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'opencode' })
    const opencodeSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'opencode-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createOpencodeLoopSession.mockResolvedValue(opencodeSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'opencode', model: 'opencode-go/deepseek-v4-flash' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('opencode-ok')
    expect(createOpencodeLoopSession).toHaveBeenCalledOnce()
    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(opencodeSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'opencode-go/deepseek-v4-flash',
      }),
    )
    await session.dispose()
    expect(opencodeSession.dispose).toHaveBeenCalledOnce()
  })

  it('dispatches cline credits runtime with providerId cline', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cline' })
    const clineSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'credits-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createClineLoopSession.mockResolvedValue(clineSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'cline', model: 'deepseek/deepseek-chat' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('credits-ok')
    expect(clineSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'deepseek/deepseek-chat',
        providerId: 'cline',
      }),
    )
    await session.dispose()
  })
})

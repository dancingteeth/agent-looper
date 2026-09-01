import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { loopConfigSchema } from '../loop/loopConfig.js'

const runCursorAgentPrompt = vi.fn()
const createClineLoopSession = vi.fn()
const createOpencodeLoopSession = vi.fn()
const createPiLoopSession = vi.fn()
const createCodexLoopSession = vi.fn()
const createDshLoopSession = vi.fn()
const createMuseLoopSession = vi.fn()

vi.mock('./cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('./clineAgent.js', () => ({
  createClineLoopSession,
}))

vi.mock('./opencodeAgent.js', () => ({
  createOpencodeLoopSession,
}))

vi.mock('./piAgent.js', () => ({
  createPiLoopSession,
}))

vi.mock('./codexAgent.js', () => ({
  createCodexLoopSession,
}))

vi.mock('./dshAgent.js', () => ({
  createDshLoopSession,
}))

vi.mock('./museAgent.js', () => ({
  createMuseLoopSession,
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
    createPiLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'pi-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createCodexLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'codex-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createDshLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'dsh-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createMuseLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'muse-ok' }),
      recycle: vi.fn().mockResolvedValue(undefined),
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
    expect(createPiLoopSession).not.toHaveBeenCalled()
    expect(createCodexLoopSession).not.toHaveBeenCalled()
    expect(createDshLoopSession).not.toHaveBeenCalled()
    expect(createMuseLoopSession).not.toHaveBeenCalled()
    await session.dispose()
  })

  it('does not load optional session factories for cursor runtime', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'cursor' })
    await createLoopAgentSession(config, testCtx)
    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(createOpencodeLoopSession).not.toHaveBeenCalled()
    expect(createPiLoopSession).not.toHaveBeenCalled()
    expect(createCodexLoopSession).not.toHaveBeenCalled()
    expect(createDshLoopSession).not.toHaveBeenCalled()
    expect(createMuseLoopSession).not.toHaveBeenCalled()
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

  it('dispatches pi runtime to Pi session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'pi' })
    const piSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'pi-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createPiLoopSession.mockResolvedValue(piSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'pi', model: 'openrouter/deepseek/deepseek-chat' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('pi-ok')
    expect(createPiLoopSession).toHaveBeenCalledOnce()
    expect(piSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'openrouter/deepseek/deepseek-chat',
      }),
    )
    await session.dispose()
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

  it('dispatches codex runtime to Codex session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'codex' })
    const codexSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'codex-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createCodexLoopSession.mockResolvedValue(codexSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'codex', model: 'gpt-5.6-luna' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('codex-ok')
    expect(createCodexLoopSession).toHaveBeenCalledOnce()
    expect(createClineLoopSession).not.toHaveBeenCalled()
    expect(codexSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'gpt-5.6-luna',
      }),
    )
    await session.dispose()
    expect(codexSession.dispose).toHaveBeenCalledOnce()
  })

  it('dispatches dsh runtime to DSH session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'dsh' })
    const dshSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'dsh-ok' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createDshLoopSession.mockResolvedValue(dshSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'dsh', model: 'deepseek-official/deepseek-v4-flash' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('dsh-ok')
    expect(createDshLoopSession).toHaveBeenCalledOnce()
    expect(createCodexLoopSession).not.toHaveBeenCalled()
    expect(dshSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'deepseek-official/deepseek-v4-flash',
      }),
    )
    await session.dispose()
    expect(dshSession.dispose).toHaveBeenCalledOnce()
  })

  it('dispatches muse runtime to Muse session', async () => {
    const { createLoopAgentSession } = await import('./agentRunner.js')
    const config = loopConfigSchema.parse({ verify: 'true', runtime: 'muse' })
    const museSession = {
      runPrompt: vi.fn().mockResolvedValue({ text: 'muse-ok' }),
      recycle: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined),
    }
    createMuseLoopSession.mockResolvedValue(museSession)

    const session = await createLoopAgentSession(config, testCtx)
    const result = await session.runIterationPrompt(
      'prompt',
      { runtime: 'muse', model: 'muse-spark-1.2-contributor', reasoningEffort: 'medium' },
      { assistantOutput: 'none' },
    )

    expect(result.text).toBe('muse-ok')
    expect(createMuseLoopSession).toHaveBeenCalledOnce()
    expect(createDshLoopSession).not.toHaveBeenCalled()
    expect(museSession.runPrompt).toHaveBeenCalledWith(
      'prompt',
      expect.objectContaining({
        modelId: 'muse-spark-1.2-contributor',
        reasoningEffort: 'medium',
      }),
    )
    await session.dispose()
    expect(museSession.dispose).toHaveBeenCalledOnce()
  })
})

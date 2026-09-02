import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { runOneShotAgentPrompt } from './oneShotAgentRun.js'

const {
  runCursorAgentPrompt,
  createClineLoopSession,
  createOpencodeLoopSession,
  createPiLoopSession,
  createCodexLoopSession,
  createDshLoopSession,
  createMuseLoopSession,
  createClaudeLoopSession,
} = vi.hoisted(() => ({
  runCursorAgentPrompt: vi.fn(),
  createClineLoopSession: vi.fn(),
  createOpencodeLoopSession: vi.fn(),
  createPiLoopSession: vi.fn(),
  createCodexLoopSession: vi.fn(),
  createDshLoopSession: vi.fn(),
  createMuseLoopSession: vi.fn(),
  createClaudeLoopSession: vi.fn(),
}))

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

vi.mock('./claudeAgent.js', () => ({
  createClaudeLoopSession,
}))

const testCtx = {
  repoRoot: '/repo',
  profile: repoProfileSchema.parse({}),
}

describe('runOneShotAgentPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    runCursorAgentPrompt.mockResolvedValue({ text: 'cursor' })
  })

  it('maps review phase to the Cursor review role', async () => {
    await runOneShotAgentPrompt(
      testCtx,
      'review me',
      { runtime: 'cursor', model: 'grok-4.6' },
      { phase: 'review' },
    )
    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      testCtx,
      'review me',
      expect.objectContaining({
        role: 'review',
        phase: 'review',
        assistantOutput: 'none',
        modelId: 'grok-4.6',
      }),
    )
  })

  it('maps verify phase to the Cursor worker role', async () => {
    await runOneShotAgentPrompt(
      testCtx,
      'verify me',
      { runtime: 'cursor', model: 'composer-2.5' },
      { phase: 'verify' },
    )
    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      testCtx,
      'verify me',
      expect.objectContaining({
        role: 'worker',
        phase: 'verify',
        assistantOutput: 'none',
        modelId: 'composer-2.5',
      }),
    )
  })

  it('maps scaffold phase to Cursor review role so the judge (Grok) can write the spec', async () => {
    const onAssistantText = vi.fn()
    await runOneShotAgentPrompt(
      testCtx,
      'scaffold me',
      { runtime: 'cursor', model: 'grok-4.6' },
      { phase: 'scaffold', onAssistantText },
    )
    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      testCtx,
      'scaffold me',
      expect.objectContaining({
        role: 'review',
        phase: 'review',
        assistantOutput: 'none',
        modelId: 'grok-4.6',
        onAssistantText,
      }),
    )
  })

  it('disposes optional-runtime sessions after a successful prompt', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'ok' })
    createOpencodeLoopSession.mockResolvedValue({ runPrompt, dispose })

    const result = await runOneShotAgentPrompt(
      testCtx,
      'go',
      { runtime: 'opencode', model: 'opencode-go/deepseek-v4-flash' },
      { phase: 'verify' },
    )
    expect(result.text).toBe('ok')
    expect(runPrompt).toHaveBeenCalledWith(
      'go',
      expect.objectContaining({ phase: 'verify', assistantOutput: 'none' }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('disposes optional-runtime sessions when the prompt throws', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockRejectedValue(new Error('transport'))
    createPiLoopSession.mockResolvedValue({ runPrompt, dispose })

    await expect(
      runOneShotAgentPrompt(
        testCtx,
        'go',
        { runtime: 'pi', model: 'openrouter/deepseek/deepseek-chat' },
        { phase: 'review' },
      ),
    ).rejects.toThrow('transport')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('passes Pi reasoningEffort through to the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'pi' })
    createPiLoopSession.mockResolvedValue({ runPrompt, dispose })

    await runOneShotAgentPrompt(
      testCtx,
      'go',
      {
        runtime: 'pi',
        model: 'openrouter/deepseek/deepseek-chat',
        reasoningEffort: 'high',
      },
      { phase: 'verify' },
    )
    expect(runPrompt).toHaveBeenCalledWith(
      'go',
      expect.objectContaining({
        reasoningEffort: 'high',
        phase: 'verify',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('passes Cline providerId and reasoningEffort', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'cline' })
    createClineLoopSession.mockResolvedValue({ runPrompt, dispose })

    await runOneShotAgentPrompt(
      testCtx,
      'go',
      {
        runtime: 'cline-pass',
        model: 'cline-pass/deepseek-v4-flash',
        reasoningEffort: 'high',
      },
      { phase: 'review' },
    )
    expect(runPrompt).toHaveBeenCalledWith(
      'go',
      expect.objectContaining({
        providerId: 'cline-pass',
        reasoningEffort: 'high',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('passes Muse reasoningEffort through to the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'muse' })
    createMuseLoopSession.mockResolvedValue({ runPrompt, dispose })

    await runOneShotAgentPrompt(
      testCtx,
      'go',
      {
        runtime: 'muse',
        model: 'muse-spark-1.2',
        reasoningEffort: 'high',
      },
      { phase: 'review' },
    )
    expect(runPrompt).toHaveBeenCalledWith(
      'go',
      expect.objectContaining({
        reasoningEffort: 'high',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('dispatches Claude one-shot review to a Claude session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'claude' })
    createClaudeLoopSession.mockResolvedValue({ runPrompt, dispose })

    await runOneShotAgentPrompt(
      testCtx,
      'go',
      { runtime: 'claude', model: 'opus' },
      { phase: 'review' },
    )
    expect(runPrompt).toHaveBeenCalledWith(
      'go',
      expect.objectContaining({
        modelId: 'opus',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { runReviewAgentPrompt } from './reviewAgentRun.js'

const {
  runCursorAgentPrompt,
  createClineLoopSession,
  createOpencodeLoopSession,
  createPiLoopSession,
  createCodexLoopSession,
} = vi.hoisted(() => ({
  runCursorAgentPrompt: vi.fn(),
  createClineLoopSession: vi.fn(),
  createOpencodeLoopSession: vi.fn(),
  createPiLoopSession: vi.fn(),
  createCodexLoopSession: vi.fn(),
}))

vi.mock('../agents/cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('../agents/clineAgent.js', () => ({
  createClineLoopSession,
}))

vi.mock('../agents/opencodeAgent.js', () => ({
  createOpencodeLoopSession,
}))

vi.mock('../agents/piAgent.js', () => ({
  createPiLoopSession,
}))

vi.mock('../agents/codexAgent.js', () => ({
  createCodexLoopSession,
}))

const testCtx = {
  repoRoot: '/repo',
  profile: repoProfileSchema.parse({}),
}

describe('runReviewAgentPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    runCursorAgentPrompt.mockResolvedValue({ text: 'cursor-review' })
    createClineLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'cline-review' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createOpencodeLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'opencode-review' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createPiLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'pi-review' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
    createCodexLoopSession.mockResolvedValue({
      runPrompt: vi.fn().mockResolvedValue({ text: 'codex-review' }),
      dispose: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('dispatches cursor judge to runCursorAgentPrompt with review role', async () => {
    const result = await runReviewAgentPrompt(testCtx, 'review me', {
      runtime: 'cursor',
      model: 'grok-4.5',
    })
    expect(result.text).toBe('cursor-review')
    expect(runCursorAgentPrompt).toHaveBeenCalledWith(
      testCtx,
      'review me',
      expect.objectContaining({
        modelId: 'grok-4.5',
        role: 'review',
        phase: 'review',
        assistantOutput: 'none',
      }),
    )
  })

  it('dispatches cline-pass judge and disposes the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'cline-review' })
    createClineLoopSession.mockResolvedValue({ runPrompt, dispose })

    const result = await runReviewAgentPrompt(testCtx, 'review me', {
      runtime: 'cline-pass',
      model: 'cline-pass/deepseek-v4-flash',
    })
    expect(result.text).toBe('cline-review')
    expect(runPrompt).toHaveBeenCalledWith(
      'review me',
      expect.objectContaining({
        modelId: 'cline-pass/deepseek-v4-flash',
        providerId: 'cline-pass',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('dispatches opencode judge and disposes the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'opencode-review' })
    createOpencodeLoopSession.mockResolvedValue({ runPrompt, dispose })

    const result = await runReviewAgentPrompt(testCtx, 'review me', {
      runtime: 'opencode',
      model: 'opencode-go/deepseek-v4-flash',
    })
    expect(result.text).toBe('opencode-review')
    expect(runPrompt).toHaveBeenCalledWith(
      'review me',
      expect.objectContaining({
        modelId: 'opencode-go/deepseek-v4-flash',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('dispatches pi judge and disposes the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'pi-review' })
    createPiLoopSession.mockResolvedValue({ runPrompt, dispose })

    const result = await runReviewAgentPrompt(testCtx, 'review me', {
      runtime: 'pi',
      model: 'openrouter/deepseek/deepseek-chat',
    })
    expect(result.text).toBe('pi-review')
    expect(runPrompt).toHaveBeenCalledWith(
      'review me',
      expect.objectContaining({
        modelId: 'openrouter/deepseek/deepseek-chat',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('dispatches codex judge and disposes the session', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined)
    const runPrompt = vi.fn().mockResolvedValue({ text: 'codex-review' })
    createCodexLoopSession.mockResolvedValue({ runPrompt, dispose })

    const result = await runReviewAgentPrompt(testCtx, 'review me', {
      runtime: 'codex',
      model: 'gpt-5.6-luna',
    })
    expect(result.text).toBe('codex-review')
    expect(runPrompt).toHaveBeenCalledWith(
      'review me',
      expect.objectContaining({
        modelId: 'gpt-5.6-luna',
        phase: 'review',
      }),
    )
    expect(dispose).toHaveBeenCalledOnce()
  })
})

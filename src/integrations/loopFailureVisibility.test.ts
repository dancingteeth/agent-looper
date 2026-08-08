import { afterEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import {
  buildLoopFailureHitlDescription,
  maybeCreateIncompleteLoopHitl,
} from './loopFailureVisibility.js'

const { createHitlCheckpoint } = vi.hoisted(() => ({
  createHitlCheckpoint: vi.fn(),
}))

vi.mock('./hitlCheckpoint.js', () => ({
  createHitlCheckpoint,
  hitlLoopOverridesFrom: vi.fn((c: Record<string, unknown>) => c),
}))

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.AGENT_LOOP_TELEGRAM_BOT_TOKEN
  delete process.env.TELEGRAM_BOT_TOKEN
  delete process.env.AGENT_LOOP_TELEGRAM_CHAT_ID
})

describe('buildLoopFailureHitlDescription', () => {
  it('mentions notify fallback for notify_failed', () => {
    const text = buildLoopFailureHitlDescription({
      bundleLabel: '.cursor/loops/mcp-server',
      completionReason: 'fetch failed',
      reason: 'notify_failed',
      telegramDetail: 'send failed',
    })
    expect(text).toContain('mcp-server')
    expect(text).toContain('fetch failed')
    expect(text).toContain('Telegram failure notify did not land')
    expect(text).toContain('send failed')
  })
})

describe('maybeCreateIncompleteLoopHitl', () => {
  const profile = repoProfileSchema.parse({
    telegramNotify: { chatId: '123', onSuccess: true, onFailure: true },
    hitlProvider: 'file',
  })

  it('skips when loop completed', async () => {
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: true, completionReason: 'ok' },
      telegramReportSent: false,
      config: { notifyTelegram: true, hitlOnFailure: true },
    })
    expect(id).toBeUndefined()
    expect(createHitlCheckpoint).not.toHaveBeenCalled()
  })

  it('creates notify_failed HITL when telegram configured but report not sent', async () => {
    process.env.AGENT_LOOP_TELEGRAM_BOT_TOKEN = 'token'
    createHitlCheckpoint.mockResolvedValue('hitl-1')
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: false, completionReason: 'Agent SDK error: fetch failed' },
      telegramReportSent: false,
      config: { notifyTelegram: true, hitlProvider: 'file' },
    })
    expect(id).toBe('hitl-1')
    expect(createHitlCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'notify_failed' }),
    )
  })

  it('creates loop_failure HITL when hitlOnFailure and telegram succeeded', async () => {
    createHitlCheckpoint.mockResolvedValue('hitl-2')
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: false, completionReason: 'verify failed' },
      telegramReportSent: true,
      config: { notifyTelegram: true, hitlOnFailure: true, hitlProvider: 'github' },
    })
    expect(id).toBe('hitl-2')
    expect(createHitlCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'loop_failure' }),
    )
  })

  it('skips notify_failed when telegram was never configured', async () => {
    const bare = repoProfileSchema.parse({ hitlProvider: 'file' })
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile: bare },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: false, completionReason: 'boom' },
      telegramReportSent: false,
      config: { notifyTelegram: true },
    })
    expect(id).toBeUndefined()
    expect(createHitlCheckpoint).not.toHaveBeenCalled()
  })

  it('skips notify_failed when onFailure is false (structured)', async () => {
    process.env.AGENT_LOOP_TELEGRAM_BOT_TOKEN = 'token'
    const noFailNotify = repoProfileSchema.parse({
      telegramNotify: { chatId: '123', onSuccess: true, onFailure: false },
      hitlProvider: 'file',
    })
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile: noFailNotify },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: false, completionReason: 'boom' },
      telegramReportSent: false,
      config: { notifyTelegram: true, hitlProvider: 'file' },
    })
    expect(id).toBeUndefined()
    expect(createHitlCheckpoint).not.toHaveBeenCalled()
  })

  it('creates notify_failed when telegram intended but credentials missing', async () => {
    createHitlCheckpoint.mockResolvedValue('hitl-missing-creds')
    const id = await maybeCreateIncompleteLoopHitl({
      ctx: { repoRoot: '/tmp/repo', profile },
      loopDir: '/tmp/repo/.cursor/loops/x',
      bundleLabel: 'x',
      result: { complete: false, completionReason: 'fetch failed' },
      telegramReportSent: false,
      config: { notifyTelegram: true, hitlProvider: 'file' },
    })
    expect(id).toBe('hitl-missing-creds')
    expect(createHitlCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'notify_failed' }),
    )
  })
})

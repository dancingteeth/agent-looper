import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOTIFY_WEBHOOK_URL_ENV,
  formatLoopPrCommentBody,
  resolveNotifyWebhookUrl,
  resolvePrNumber,
  sendNotifyWebhook,
  shouldSendNotifyWebhook,
} from './loopNotifyChannels.js'

const { execFileSync } = vi.hoisted(() => ({
  execFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync,
}))

afterEach(() => {
  vi.clearAllMocks()
  delete process.env[NOTIFY_WEBHOOK_URL_ENV]
  delete process.env.AGENT_LOOP_PR_NUMBER
})

describe('notifyWebhook', () => {
  it('resolves URL from env', () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/x'
    expect(resolveNotifyWebhookUrl(undefined)).toBe('https://hooks.example/x')
  })

  it('respects onFailure=false', () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/x'
    expect(
      shouldSendNotifyWebhook({
        settings: { onSuccess: true, onFailure: false },
        complete: false,
      }),
    ).toBe(false)
  })

  it('POSTs JSON payload', async () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/x'
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    const ok = await sendNotifyWebhook({
      settings: { onSuccess: true, onFailure: true },
      payload: {
        v: 1,
        kind: 'loop',
        bundle: 'x',
        complete: true,
        exitCode: 0,
        reason: 'ok',
      },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    expect(ok).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://hooks.example/x',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('pr comment helpers', () => {
  it('formats markdown body', () => {
    const body = formatLoopPrCommentBody({
      kind: 'loop',
      bundle: '.cursor/loops/x',
      complete: false,
      exitCode: 2,
      reason: 'fetch failed',
      exportPack: '.cursor/loop-exports/x',
    })
    expect(body).toContain('incomplete')
    expect(body).toContain('loop-exports/x')
  })

  it('resolves PR from env', () => {
    process.env.AGENT_LOOP_PR_NUMBER = '9'
    expect(resolvePrNumber({ repoRoot: '/tmp' })).toBe(9)
  })

  it('falls back to gh pr view', () => {
    execFileSync.mockReturnValue('12\n')
    expect(resolvePrNumber({ repoRoot: '/tmp/repo' })).toBe(12)
  })
})

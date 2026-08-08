import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NOTIFY_WEBHOOK_URL_ENV,
  formatLoopPrCommentBody,
  redactWebhookUrlForLog,
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

  it('sends when settings are undefined but env URL is set', () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/x'
    expect(
      shouldSendNotifyWebhook({
        settings: undefined,
        complete: true,
      }),
    ).toBe(true)
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

  it('POSTs JSON payload with AbortSignal', async () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/x?token=secret'
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
      'https://hooks.example/x?token=secret',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    )
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('token=secret'))).toBe(false)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('https://hooks.example/x'))).toBe(
      true,
    )
    errSpy.mockRestore()
  })

  it('times out without hanging forever', async () => {
    process.env[NOTIFY_WEBHOOK_URL_ENV] = 'https://hooks.example/slow'
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (!signal) return
          signal.addEventListener('abort', () => {
            reject(new Error('aborted'))
          })
        }),
    )
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
      timeoutMs: 20,
    })
    expect(ok).toBe(false)
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('after 20ms'))).toBe(true)
    errSpy.mockRestore()
  })
})

describe('redactWebhookUrlForLog', () => {
  it('strips query and hash', () => {
    expect(redactWebhookUrlForLog('https://hooks.example/x?token=secret#frag')).toBe(
      'https://hooks.example/x',
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

  it('lists multiple export packs for batch', () => {
    const body = formatLoopPrCommentBody({
      kind: 'batch',
      bundle: '.cursor/loops/batch',
      complete: true,
      exitCode: 0,
      reason: 'ok',
      exportPack: '.cursor/loop-exports/a, .cursor/loop-exports/b',
    })
    expect(body).toContain('Export packs')
    expect(body).toContain('loop-exports/a')
    expect(body).toContain('loop-exports/b')
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

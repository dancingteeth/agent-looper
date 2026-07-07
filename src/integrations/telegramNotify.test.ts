import { describe, expect, it } from 'vitest'
import {
  resolveTelegramCredentials,
  shouldSendTelegramNotify,
  sendTelegramMessage,
  sendLoopTelegramReport,
  describeTelegramSkipReason,
  TELEGRAM_BOT_TOKEN_ENV,
  TELEGRAM_CHAT_ID_ENV,
} from './telegramNotify.js'
import type { RepoProfile } from '../context/repoProfile.js'

const baseProfile: RepoProfile = {
  taskwarriorProject: 'dxp',
  syncCommand: null,
  defaultBranch: 'main',
  agentsFile: 'AGENTS.md',
  reviewsFile: 'REVIEWS.md',
  skillsGlob: 'packages/skills/*/SKILL.md',
  clientName: 'test',
  telegramNotify: {
    chatId: '12345',
    onSuccess: true,
    onFailure: true,
  },
}

describe('resolveTelegramCredentials', () => {
  it('returns null when bot token env is missing', () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    const prevChat = process.env[TELEGRAM_CHAT_ID_ENV]
    delete process.env[TELEGRAM_BOT_TOKEN_ENV]
    delete process.env.TELEGRAM_BOT_TOKEN
    delete process.env[TELEGRAM_CHAT_ID_ENV]

    expect(resolveTelegramCredentials(baseProfile)).toBeNull()

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    if (prevChat) process.env[TELEGRAM_CHAT_ID_ENV] = prevChat
  })

  it('uses env chat id over profile chat id', () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    const prevChat = process.env[TELEGRAM_CHAT_ID_ENV]
    process.env[TELEGRAM_BOT_TOKEN_ENV] = 'bot-token'
    process.env[TELEGRAM_CHAT_ID_ENV] = 'env-chat'

    const creds = resolveTelegramCredentials(baseProfile)
    expect(creds?.chatId).toBe('env-chat')

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    else delete process.env[TELEGRAM_BOT_TOKEN_ENV]
    if (prevChat) process.env[TELEGRAM_CHAT_ID_ENV] = prevChat
    else delete process.env[TELEGRAM_CHAT_ID_ENV]
  })
})

describe('shouldSendTelegramNotify', () => {
  it('skips when loop notifyTelegram is false', () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    process.env[TELEGRAM_BOT_TOKEN_ENV] = 'bot-token'

    expect(
      shouldSendTelegramNotify({
        profile: baseProfile,
        notifyTelegram: false,
        complete: true,
      }),
    ).toBe(false)

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    else delete process.env[TELEGRAM_BOT_TOKEN_ENV]
  })

  it('respects onFailure=false', () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    process.env[TELEGRAM_BOT_TOKEN_ENV] = 'bot-token'

    expect(
      shouldSendTelegramNotify({
        profile: {
          ...baseProfile,
          telegramNotify: { chatId: '12345', onSuccess: true, onFailure: false },
        },
        notifyTelegram: true,
        complete: false,
      }),
    ).toBe(false)

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    else delete process.env[TELEGRAM_BOT_TOKEN_ENV]
  })
})

describe('sendTelegramMessage', () => {
  it('posts JSON to Telegram Bot API', async () => {
    let captured: { url: string; body: unknown } | undefined
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = {
        url: String(input),
        body: JSON.parse(String(init?.body)),
      }
      return new Response('{"ok":true}', { status: 200 })
    }

    await sendTelegramMessage({
      botToken: 'abc',
      chatId: '999',
      text: 'hello',
      fetchImpl,
    })

    expect(captured?.url).toBe('https://api.telegram.org/botabc/sendMessage')
    expect(captured?.body).toEqual({
      chat_id: '999',
      text: 'hello',
      disable_web_page_preview: true,
    })
  })
})

describe('describeTelegramSkipReason', () => {
  it('explains missing chat id when token is present', () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    const prevChat = process.env[TELEGRAM_CHAT_ID_ENV]
    process.env[TELEGRAM_BOT_TOKEN_ENV] = 'bot-token'
    delete process.env[TELEGRAM_CHAT_ID_ENV]

    const reason = describeTelegramSkipReason({
      profile: { ...baseProfile, telegramNotify: { onSuccess: true, onFailure: true } },
      notifyTelegram: true,
      complete: true,
    })
    expect(reason).toMatch(/chat id/i)

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    else delete process.env[TELEGRAM_BOT_TOKEN_ENV]
    if (prevChat) process.env[TELEGRAM_CHAT_ID_ENV] = prevChat
  })
})

describe('sendLoopTelegramReport', () => {
  it('is non-blocking on API failure', async () => {
    const prevToken = process.env[TELEGRAM_BOT_TOKEN_ENV]
    process.env[TELEGRAM_BOT_TOKEN_ENV] = 'bot-token'

    const sent = await sendLoopTelegramReport({
      profile: baseProfile,
      notifyTelegram: true,
      complete: true,
      report: 'done',
      fetchImpl: async () => new Response('nope', { status: 500 }),
    })

    expect(sent).toBe(false)

    if (prevToken) process.env[TELEGRAM_BOT_TOKEN_ENV] = prevToken
    else delete process.env[TELEGRAM_BOT_TOKEN_ENV]
  })
})

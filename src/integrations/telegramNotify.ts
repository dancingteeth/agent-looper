import type { RepoProfile } from '../context/repoProfile.js'

export const TELEGRAM_BOT_TOKEN_ENV = 'AGENT_LOOP_TELEGRAM_BOT_TOKEN'
export const TELEGRAM_BOT_TOKEN_FALLBACK_ENV = 'TELEGRAM_BOT_TOKEN'
export const TELEGRAM_CHAT_ID_ENV = 'AGENT_LOOP_TELEGRAM_CHAT_ID'

export type TelegramNotifySettings = {
  chatId: string
  onSuccess: boolean
  onFailure: boolean
}

export type ResolvedTelegramCredentials = {
  botToken: string
  chatId: string
  onSuccess: boolean
  onFailure: boolean
}

export type TelegramNotifyConfig = {
  chatId?: string
  onSuccess: boolean
  onFailure: boolean
}

export function resolveTelegramNotifySettings(
  profile: RepoProfile,
): TelegramNotifyConfig | undefined {
  const config = profile.telegramNotify
  if (!config) return undefined
  return {
    chatId: config.chatId,
    onSuccess: config.onSuccess,
    onFailure: config.onFailure,
  }
}

export function resolveTelegramCredentials(
  profile: RepoProfile,
): ResolvedTelegramCredentials | null {
  const settings = resolveTelegramNotifySettings(profile)
  const chatIdFromEnv = process.env[TELEGRAM_CHAT_ID_ENV]?.trim()
  const chatId = chatIdFromEnv || settings?.chatId
  if (!chatId) return null

  const botToken =
    process.env[TELEGRAM_BOT_TOKEN_ENV]?.trim() ||
    process.env[TELEGRAM_BOT_TOKEN_FALLBACK_ENV]?.trim()
  if (!botToken) return null

  return {
    botToken,
    chatId,
    onSuccess: settings?.onSuccess ?? true,
    onFailure: settings?.onFailure ?? true,
  }
}

export function shouldSendTelegramNotify(input: {
  profile: RepoProfile
  notifyTelegram: boolean
  complete: boolean
}): boolean {
  if (!input.notifyTelegram) return false
  const credentials = resolveTelegramCredentials(input.profile)
  if (!credentials) return false
  return input.complete ? credentials.onSuccess : credentials.onFailure
}

export async function sendTelegramMessage(input: {
  botToken: string
  chatId: string
  text: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetchFn = input.fetchImpl ?? fetch
  const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`
  const response = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: input.chatId,
      text: input.text,
      disable_web_page_preview: true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram sendMessage failed (${response.status}): ${body}`)
  }
}

export async function sendLoopTelegramReport(input: {
  profile: RepoProfile
  report: string
  notifyTelegram: boolean
  complete: boolean
  fetchImpl?: typeof fetch
}): Promise<boolean> {
  if (
    !shouldSendTelegramNotify({
      profile: input.profile,
      notifyTelegram: input.notifyTelegram,
      complete: input.complete,
    })
  ) {
    return false
  }

  const credentials = resolveTelegramCredentials(input.profile)
  if (!credentials) return false

  try {
    await sendTelegramMessage({
      botToken: credentials.botToken,
      chatId: credentials.chatId,
      text: input.report,
      fetchImpl: input.fetchImpl,
    })
    console.error('[agent-loop] telegram report sent')
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] telegram notify failed (non-blocking): ${message}`)
    return false
  }
}

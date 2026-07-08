import type { RepoProfile } from '../context/repoProfile.js'
import {
  readLatestReviewContent,
  reviewDocumentFilename,
} from '../loop/loopReport.js'

export const TELEGRAM_BOT_TOKEN_ENV = 'AGENT_LOOP_TELEGRAM_BOT_TOKEN'
export const TELEGRAM_BOT_TOKEN_FALLBACK_ENV = 'TELEGRAM_BOT_TOKEN'
export const TELEGRAM_CHAT_ID_ENV = 'AGENT_LOOP_TELEGRAM_CHAT_ID'

export type TelegramNotifySettings = {
  chatId: string
  onSuccess: boolean
  onFailure: boolean
  attachReview: boolean
}

export type ResolvedTelegramCredentials = {
  botToken: string
  chatId: string
  onSuccess: boolean
  onFailure: boolean
  attachReview: boolean
}

export type TelegramNotifyConfig = {
  chatId?: string
  onSuccess: boolean
  onFailure: boolean
  attachReview: boolean
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
    attachReview: config.attachReview,
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
    attachReview: settings?.attachReview ?? true,
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

/** Human-readable reason when a loop completion report is not sent to Telegram. */
export function describeTelegramSkipReason(input: {
  profile: RepoProfile
  notifyTelegram: boolean
  complete: boolean
}): string | null {
  if (!input.notifyTelegram) return 'notifyTelegram=false'

  const settings = resolveTelegramNotifySettings(input.profile)
  const chatIdFromEnv = process.env[TELEGRAM_CHAT_ID_ENV]?.trim()
  const chatId = chatIdFromEnv || settings?.chatId
  const botToken =
    process.env[TELEGRAM_BOT_TOKEN_ENV]?.trim() ||
    process.env[TELEGRAM_BOT_TOKEN_FALLBACK_ENV]?.trim()

  if (!botToken && !chatId) {
    return `missing bot token (${TELEGRAM_BOT_TOKEN_ENV} or ${TELEGRAM_BOT_TOKEN_FALLBACK_ENV}) and chat id (${TELEGRAM_CHAT_ID_ENV} or telegramNotify.chatId)`
  }
  if (!botToken) {
    return `missing bot token (${TELEGRAM_BOT_TOKEN_ENV} or ${TELEGRAM_BOT_TOKEN_FALLBACK_ENV})`
  }
  if (!chatId) {
    return `missing chat id (${TELEGRAM_CHAT_ID_ENV} or telegramNotify.chatId in .cursor/agent-loop.repo.json)`
  }

  const credentials = resolveTelegramCredentials(input.profile)
  if (!credentials) return 'telegram credentials could not be resolved'

  const allowed = input.complete ? credentials.onSuccess : credentials.onFailure
  if (!allowed) {
    return input.complete ? 'telegramNotify.onSuccess=false' : 'telegramNotify.onFailure=false'
  }

  return null
}

export function shouldAttachTelegramReview(input: {
  profile: RepoProfile
  notifyTelegram: boolean
  telegramAttachReview?: boolean
}): boolean {
  if (!input.notifyTelegram) return false
  if (input.telegramAttachReview === false) return false
  const credentials = resolveTelegramCredentials(input.profile)
  return credentials?.attachReview ?? true
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

export async function sendTelegramDocument(input: {
  botToken: string
  chatId: string
  filename: string
  content: string
  caption?: string
  fetchImpl?: typeof fetch
}): Promise<void> {
  const fetchFn = input.fetchImpl ?? fetch
  const url = `https://api.telegram.org/bot${input.botToken}/sendDocument`
  const form = new FormData()
  form.append('chat_id', input.chatId)
  form.append(
    'document',
    new Blob([input.content], { type: 'text/markdown' }),
    input.filename,
  )
  if (input.caption?.trim()) {
    form.append('caption', input.caption.trim())
  }

  const response = await fetchFn(url, {
    method: 'POST',
    body: form,
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram sendDocument failed (${response.status}): ${body}`)
  }
}

export async function sendLoopTelegramReviewAttachment(input: {
  profile: RepoProfile
  notifyTelegram: boolean
  telegramAttachReview?: boolean
  complete: boolean
  loopDir: string
  bundleLabel?: string
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

  if (
    !shouldAttachTelegramReview({
      profile: input.profile,
      notifyTelegram: input.notifyTelegram,
      telegramAttachReview: input.telegramAttachReview,
    })
  ) {
    return false
  }

  const content = readLatestReviewContent(input.loopDir)
  if (!content) return false

  const credentials = resolveTelegramCredentials(input.profile)
  if (!credentials) return false

  const filename = reviewDocumentFilename(input.loopDir)
  const caption = input.bundleLabel ? `Review: ${input.bundleLabel}` : undefined

  try {
    await sendTelegramDocument({
      botToken: credentials.botToken,
      chatId: credentials.chatId,
      filename,
      content,
      caption,
      fetchImpl: input.fetchImpl,
    })
    console.error(`[agent-loop] telegram review attached: ${filename}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] telegram review attach failed (non-blocking): ${message}`)
    return false
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
    const skipReason = describeTelegramSkipReason({
      profile: input.profile,
      notifyTelegram: input.notifyTelegram,
      complete: input.complete,
    })
    if (skipReason) {
      console.error(`[agent-loop] telegram skipped: ${skipReason}`)
    }
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

import { execFileSync } from 'node:child_process'

export const NOTIFY_WEBHOOK_URL_ENV = 'AGENT_LOOP_NOTIFY_WEBHOOK_URL'

export type NotifyWebhookSettings = {
  /** Explicit URL; otherwise AGENT_LOOP_NOTIFY_WEBHOOK_URL. */
  url?: string
  onSuccess: boolean
  onFailure: boolean
}

export type NotifyWebhookPayload = {
  v: 1
  kind: 'loop' | 'batch'
  bundle: string
  complete: boolean
  exitCode: 0 | 1 | 2
  reason: string
  report?: string
  iterations?: number
  loopsRun?: number
  hitl?: string
  runReport?: string
  exportPack?: string
}

export function resolveNotifyWebhookUrl(
  settings: NotifyWebhookSettings | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const fromSettings = settings?.url?.trim()
  if (fromSettings) return fromSettings
  return env[NOTIFY_WEBHOOK_URL_ENV]?.trim() || undefined
}

export function shouldSendNotifyWebhook(input: {
  settings: NotifyWebhookSettings | undefined
  complete: boolean
  env?: NodeJS.ProcessEnv
}): boolean {
  const url = resolveNotifyWebhookUrl(input.settings, input.env)
  if (!url) return false
  const onSuccess = input.settings?.onSuccess ?? true
  const onFailure = input.settings?.onFailure ?? true
  return input.complete ? onSuccess : onFailure
}

/**
 * POST JSON completion payload to notifyWebhook.url / AGENT_LOOP_NOTIFY_WEBHOOK_URL.
 * Non-blocking on failure.
 */
export async function sendNotifyWebhook(input: {
  settings: NotifyWebhookSettings | undefined
  payload: NotifyWebhookPayload
  fetchImpl?: typeof fetch
  env?: NodeJS.ProcessEnv
}): Promise<boolean> {
  if (!shouldSendNotifyWebhook({ settings: input.settings, complete: input.payload.complete, env: input.env })) {
    return false
  }
  const url = resolveNotifyWebhookUrl(input.settings, input.env)
  if (!url) return false

  const fetchFn = input.fetchImpl ?? fetch
  try {
    console.error(`[agent-loop] notifyWebhook → ${url}`)
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input.payload),
    })
    if (!response.ok) {
      const body = await response.text()
      console.error(
        `[agent-loop] warn: notifyWebhook failed (${response.status}): ${body.slice(0, 200)}`,
      )
      return false
    }
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: notifyWebhook failed (non-blocking): ${message}`)
    return false
  }
}

export const NOTIFY_PR_NUMBER_ENV = 'AGENT_LOOP_PR_NUMBER'
export const NOTIFY_PR_NUMBER_FALLBACK_ENV = 'GH_PR_NUMBER'

export function resolvePrNumber(input: {
  explicit?: number | string
  env?: NodeJS.ProcessEnv
  repoRoot: string
}): number | undefined {
  const env = input.env ?? process.env
  const raw =
    input.explicit !== undefined
      ? String(input.explicit)
      : env[NOTIFY_PR_NUMBER_ENV]?.trim() || env[NOTIFY_PR_NUMBER_FALLBACK_ENV]?.trim()
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  }

  try {
    const output = execFileSync('gh', ['pr', 'view', '--json', 'number', '-q', '.number'], {
      cwd: input.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const n = Number(output.trim())
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
  } catch {
    // no PR for current branch
  }
  return undefined
}

export function formatLoopPrCommentBody(input: {
  kind: 'loop' | 'batch'
  bundle: string
  complete: boolean
  exitCode: 0 | 1 | 2
  reason: string
  report?: string
  exportPack?: string
  hitl?: string
}): string {
  const status = input.complete ? 'complete' : 'incomplete'
  const lines = [
    `## Agent Looper (${input.kind})`,
    '',
    `- **Bundle:** \`${input.bundle}\``,
    `- **Status:** ${status} (exit ${input.exitCode})`,
    `- **Reason:** ${input.reason}`,
  ]
  if (input.exportPack) {
    lines.push(`- **Export pack:** \`${input.exportPack}\``)
  }
  if (input.hitl) {
    lines.push(`- **HITL:** ${input.hitl}`)
  }
  if (input.report?.trim()) {
    lines.push('', '<details><summary>Completion report</summary>', '', '```', input.report.trim().slice(0, 3500), '```', '', '</details>')
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Comment on the open PR for this branch (or AGENT_LOOP_PR_NUMBER).
 * Non-blocking on failure. Uses `gh` (same auth as GitHub HITL).
 */
export function postLoopPrComment(input: {
  repoRoot: string
  body: string
  prNumber?: number | string
  env?: NodeJS.ProcessEnv
}): string | undefined {
  const pr = resolvePrNumber({
    explicit: input.prNumber,
    env: input.env,
    repoRoot: input.repoRoot,
  })
  if (!pr) {
    console.error(
      '[agent-loop] notifyPrComment skipped — no PR for branch (set AGENT_LOOP_PR_NUMBER or open a PR)',
    )
    return undefined
  }

  try {
    console.error(`[agent-loop] notifyPrComment → PR #${pr}`)
    const output = execFileSync('gh', ['pr', 'comment', String(pr), '--body', input.body], {
      cwd: input.repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const url = output.trim().split('\n').filter(Boolean).pop()
    if (url) console.error(`[agent-loop] PR comment: ${url}`)
    return url ?? `pr:${pr}`
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] warn: notifyPrComment failed (non-blocking): ${message}`)
    return undefined
  }
}

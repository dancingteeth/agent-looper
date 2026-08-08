import type { RepoContext } from '../context/repoContext.js'
import type { AgentLoopResult } from '../loop/agentLoop.js'
import {
  createHitlCheckpoint,
  hitlLoopOverridesFrom,
} from './hitlCheckpoint.js'
import type { HitlCheckpointReason, HitlLoopOverrides } from './hitlConfig.js'
import {
  describeTelegramSkipReason,
  shouldPreflightTelegram,
  wantsTelegramFailureNotify,
} from './telegramNotify.js'

export type FailureHitlConfig = {
  hitlOnFailure?: boolean
  notifyTelegram: boolean
  taskwarriorProject?: string
  hitlProvider?: HitlLoopOverrides['hitlProvider']
  hitlFileDir?: string
  hitlCommand?: string
  hitlLinearTeam?: string
}

export function buildLoopFailureHitlDescription(input: {
  bundleLabel: string
  completionReason: string
  reason: Extract<HitlCheckpointReason, 'loop_failure' | 'notify_failed'>
  telegramDetail?: string
}): string {
  const lines = [
    `Loop incomplete: ${input.bundleLabel}`,
    input.completionReason,
    ...(input.reason === 'notify_failed'
      ? [
          'Telegram failure notify did not land — durable HITL fallback.',
          ...(input.telegramDetail ? [`Telegram: ${input.telegramDetail}`] : []),
        ]
      : ['hitlOnFailure requested a durable checkpoint for this incomplete run.']),
    'See run-report.md and failure-domains.ndjson in the loop bundle when present.',
  ]
  return lines.join('\n')
}

/**
 * When a loop ends incomplete, optionally open a HITL checkpoint:
 * - notify_failed: Telegram was requested for failures but the report did not send
 * - loop_failure: hitlOnFailure is set (and notify_failed was not already created)
 */
export async function maybeCreateIncompleteLoopHitl(input: {
  ctx: RepoContext
  loopDir: string
  bundleLabel: string
  result: Pick<AgentLoopResult, 'complete' | 'completionReason' | 'hitlCheckTaskUuid'>
  config: FailureHitlConfig
  telegramReportSent: boolean
}): Promise<string | undefined> {
  if (input.result.complete) return undefined
  if (input.result.hitlCheckTaskUuid) return undefined

  const overrides = hitlLoopOverridesFrom(input.config)
  const telegramConfigured = shouldPreflightTelegram({
    profile: input.ctx.profile,
    notifyTelegram: input.config.notifyTelegram,
  })
  const wantsFailureNotify = wantsTelegramFailureNotify({
    profile: input.ctx.profile,
    notifyTelegram: input.config.notifyTelegram,
  })
  const telegramExpectedButMissing =
    input.config.notifyTelegram &&
    telegramConfigured &&
    !input.telegramReportSent &&
    wantsFailureNotify

  if (telegramExpectedButMissing) {
    const skipDetail = describeTelegramSkipReason({
      profile: input.ctx.profile,
      notifyTelegram: input.config.notifyTelegram,
      complete: false,
    })
    const id = await createHitlCheckpoint({
      description: buildLoopFailureHitlDescription({
        bundleLabel: input.bundleLabel,
        completionReason: input.result.completionReason,
        reason: 'notify_failed',
        telegramDetail: skipDetail ?? 'send failed or returned false',
      }),
      reason: 'notify_failed',
      ctx: input.ctx,
      loopDir: input.loopDir,
      loopOverrides: overrides,
    })
    if (id) {
      console.error(`[agent-loop] HITL fallback (notify_failed): ${id}`)
      return id
    }
  }

  if (input.config.hitlOnFailure) {
    const id = await createHitlCheckpoint({
      description: buildLoopFailureHitlDescription({
        bundleLabel: input.bundleLabel,
        completionReason: input.result.completionReason,
        reason: 'loop_failure',
      }),
      reason: 'loop_failure',
      ctx: input.ctx,
      loopDir: input.loopDir,
      loopOverrides: overrides,
    })
    if (id) {
      console.error(`[agent-loop] HITL on failure: ${id}`)
      return id
    }
  }

  return undefined
}

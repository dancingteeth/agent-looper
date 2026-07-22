import { resolveTaskwarriorProject, type RepoContext } from '../context/repoContext.js'
import { createHitlCheckTask } from '../integrations/taskwarrior.js'
import { logFailureDomainFromVerify } from '../loop/loopFailureDomain.js'
import type { CursorSdkModel } from '../loop/loopAgentConfig.js'
import type { LoopConfig } from '../loop/loopConfig.js'
import { resolveShouldRunQualityReview } from '../loop/loopRisk.js'
import { runPostLoopBlockerRecheck, runPostLoopQualityReview } from '../review/loopPostReview.js'
import type { ParsedReview, ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import {
  blockingBlockers,
  reviewGateBlockers,
  reviewGateBlocksCompletion,
} from '../review/reviewVerdict.js'
import { addUsageRecord, type LoopUsageSummary } from '../usage/loopUsage.js'

export type PostSuccessReviewLog = {
  verdict: ReviewVerdict
  risk: ReviewRisk
  blockersCount: number
  reviewCycle?: number
}

export type PostSuccessReviewOutcome =
  | { action: 'skip' }
  | {
      action: 'stop'
      completionReason: string
      hitlCheckTaskUuid?: string
      reviewEscalatedToHitl?: boolean
      failureDomainReason?: 'review_gate' | 'review_gate_hitl'
      /** When true, the iteration log was already emitted or should not be written. */
      skipIterationLog?: boolean
    }
  | { action: 'continue'; reviewBlockers: string[]; reviewCyclesUsed: number; reviewLog: PostSuccessReviewLog; reviewCycle: number; gateBlockerCount: number; totalBlockerCount: number; reasoningEffort: string }
  | { action: 'success'; reviewLog?: PostSuccessReviewLog; reviewAdvisoryBlockers?: boolean }

export type PostSuccessReviewInput = {
  config: LoopConfig
  goal: string
  ctx: RepoContext
  loopDir: string
  reviewBlockers: string[] | undefined
  reviewCyclesUsed: number
  reviewModel: CursorSdkModel
  verbose?: boolean
  usageSummary: LoopUsageSummary
  reasoningEffort: string
}

export type PostSuccessReviewResult = {
  outcome: PostSuccessReviewOutcome
  usageSummary: LoopUsageSummary
  reviewLog?: PostSuccessReviewLog
  parsedReview?: ParsedReview
  reviewCycle: number
}

export function reviewGateHitlDescription(parsed: ParsedReview, reviewCycle: number): string {
  const leading = `Review gate blocked after ${reviewCycle} cycle(s)`
  if (parsed.verdict === 'UNKNOWN') {
    return `${leading}: review verdict unparseable (see review.md)`
  }
  const items = reviewGateBlockers(parsed)
    .slice(0, 4)
    .map((b) => b.replace(/\s+/g, ' ').trim())
  const body = items.length ? `: ${items.join('; ')}` : ''
  const text = `${leading}${body}`
  // hitlCheckDescriptionSchema caps at 500 chars; keep headroom for the "HITL Check: " prefix.
  return text.length > 480 ? `${text.slice(0, 477)}...` : text
}

function buildReviewGateStopOutcome(input: {
  config: LoopConfig
  ctx: RepoContext
  parsedReview: ParsedReview
  reviewCycle: number
  gateLabel: string
}): PostSuccessReviewOutcome {
  const { config, ctx, parsedReview, reviewCycle, gateLabel } = input
  if (config.reviewGateHitl) {
    let hitlTaskUuid: string | undefined
    try {
      hitlTaskUuid = createHitlCheckTask(
        reviewGateHitlDescription(parsedReview, reviewCycle),
        resolveTaskwarriorProject(config.taskwarriorProject, ctx.profile),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[agent-loop] review gate: wanted HITL escalation but ${message} — falling back to hard-fail`,
      )
    }
    if (hitlTaskUuid) {
      console.error(
        `[agent-loop] review gate: ${gateLabel} after ${reviewCycle} cycle(s) — escalated to human review`,
      )
      return {
        action: 'stop',
        completionReason: `Review gate: ${gateLabel} after ${reviewCycle} review cycle(s) — escalated to human review. See review.md; a HITL task was created.`,
        hitlCheckTaskUuid: hitlTaskUuid,
        reviewEscalatedToHitl: true,
        failureDomainReason: 'review_gate_hitl',
      }
    }
  }
  console.error(
    `[agent-loop] review gate: ${gateLabel} after ${reviewCycle} cycle(s) — stopping`,
  )
  return {
    action: 'stop',
    completionReason: `Review gate: ${gateLabel} after ${reviewCycle} review cycle(s). See review.md and fix blockers manually or increase maxReviewCycles.`,
    failureDomainReason: 'review_gate',
  }
}

export function resolvePostSuccessReviewOutcome(input: {
  config: LoopConfig
  ctx: RepoContext
  parsedReview: ParsedReview | undefined
  reviewCycle: number
  reviewCyclesUsed: number
  reasoningEffort: string
}): PostSuccessReviewOutcome {
  const { config, ctx, parsedReview, reviewCycle, reviewCyclesUsed, reasoningEffort } = input
  if (!parsedReview) {
    return { action: 'success' }
  }
  if (parsedReview.verdict === 'UNKNOWN') {
    return buildReviewGateStopOutcome({
      config,
      ctx,
      parsedReview,
      reviewCycle,
      gateLabel: 'unparseable verdict',
    })
  }
  if (config.reviewGate && reviewGateBlocksCompletion(parsedReview)) {
    const gateBlockerCount = blockingBlockers(parsedReview).length
    const nextReviewCyclesUsed = reviewCyclesUsed + 1
    if (nextReviewCyclesUsed >= config.maxReviewCycles) {
      return buildReviewGateStopOutcome({
        config,
        ctx,
        parsedReview,
        reviewCycle,
        gateLabel: `BLOCKERS (${gateBlockerCount} gating item(s))`,
      })
    }
    return {
      action: 'continue',
      reviewBlockers: reviewGateBlockers(parsedReview),
      reviewCyclesUsed: nextReviewCyclesUsed,
      reviewLog: {
        verdict: parsedReview.verdict,
        risk: parsedReview.risk,
        blockersCount: parsedReview.blockers.length,
        reviewCycle,
      },
      reviewCycle,
      gateBlockerCount,
      totalBlockerCount: parsedReview.blockers.length,
      reasoningEffort,
    }
  }
  if (
    config.reviewGate &&
    parsedReview.verdict === 'BLOCKERS' &&
    parsedReview.blockers.length > 0
  ) {
    console.error(
      `[agent-loop] review gate: BLOCKERS verdict but only warning/none-impact items (${parsedReview.blockers.length}) — loop completes`,
    )
    return {
      action: 'success',
      reviewLog: {
        verdict: parsedReview.verdict,
        risk: parsedReview.risk,
        blockersCount: parsedReview.blockers.length,
        reviewCycle,
      },
      reviewAdvisoryBlockers: true,
    }
  }
  if (!config.reviewGate && parsedReview.verdict === 'BLOCKERS') {
    console.error(
      `[agent-loop] advisory review: BLOCKERS (${parsedReview.blockers.length}) — loop still completes (reviewGate=false; set reviewGate=true to enforce)`,
    )
    return {
      action: 'success',
      reviewLog: {
        verdict: parsedReview.verdict,
        risk: parsedReview.risk,
        blockersCount: parsedReview.blockers.length,
        reviewCycle,
      },
      reviewAdvisoryBlockers: true,
    }
  }
  return {
    action: 'success',
    reviewLog: {
      verdict: parsedReview.verdict,
      risk: parsedReview.risk,
      blockersCount: parsedReview.blockers.length,
      reviewCycle,
    },
  }
}

export async function runPostSuccessReviewPhase(
  input: PostSuccessReviewInput,
): Promise<PostSuccessReviewResult> {
  const {
    config,
    goal,
    ctx,
    loopDir,
    reviewBlockers,
    reviewCyclesUsed,
    reviewModel,
    verbose,
    reasoningEffort,
  } = input
  let usageSummary = input.usageSummary

  const shouldRunReview = resolveShouldRunQualityReview(config, goal, config.verify)
  if (!shouldRunReview) {
    return { outcome: { action: 'skip' }, usageSummary, reviewCycle: 0 }
  }

  const reviewLabel = config.reviewGate
    ? 'post-success quality review (gated, Cursor SDK)'
    : 'post-success quality review (advisory, Cursor SDK)'
  console.error(`[agent-loop] ${reviewLabel}`)

  const useRecheck = config.reviewBlockerRecheck && (reviewBlockers?.length ?? 0) > 0
  let reviewCycle = 0
  let parsedReview: ParsedReview | undefined
  let reviewLog: PostSuccessReviewLog | undefined

  for (;;) {
    reviewCycle++
    try {
      const reviewResult = useRecheck
        ? await runPostLoopBlockerRecheck(loopDir, goal, ctx, reviewBlockers!, {
            verbose,
            reviewCycle,
            reviewModel,
            reviewReproduce: config.reviewReproduce,
            reviewReproduceAgent: config.reviewReproduceAgent,
            reviewSecondaryRuntime: config.reviewSecondaryRuntime,
            reviewSecondaryModel: config.reviewSecondaryModel,
          })
        : await runPostLoopQualityReview(loopDir, goal, ctx, {
            verbose,
            reviewCycle,
            reviewModel,
            reviewReproduce: config.reviewReproduce,
            reviewReproduceAgent: config.reviewReproduceAgent,
            reviewSecondaryRuntime: config.reviewSecondaryRuntime,
            reviewSecondaryModel: config.reviewSecondaryModel,
          })
      usageSummary = addUsageRecord(usageSummary, reviewResult.usage)
      parsedReview = reviewResult.parsed
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (config.reviewGate) {
        console.error(`[agent-loop] review gate: quality review failed — stopping: ${message}`)
        return {
          outcome: {
            action: 'stop',
            completionReason: `Review gate: quality review failed: ${message}`,
            skipIterationLog: true,
          },
          usageSummary,
          reviewCycle,
        }
      }
      console.error(`[agent-loop] quality review failed (non-blocking): ${message}`)
      return { outcome: { action: 'success' }, usageSummary, reviewCycle }
    }
    reviewLog = {
      verdict: parsedReview.verdict,
      risk: parsedReview.risk,
      blockersCount: parsedReview.blockers.length,
      reviewCycle,
    }
    if (parsedReview.verdict === 'UNKNOWN' && reviewCycle < config.unparseableReviewRetries) {
      console.error(
        `[agent-loop] review verdict unparseable — retrying review (${reviewCycle}/${config.unparseableReviewRetries})`,
      )
      continue
    }
    break
  }

  const outcome = resolvePostSuccessReviewOutcome({
    config,
    ctx,
    parsedReview,
    reviewCycle,
    reviewCyclesUsed,
    reasoningEffort,
  })

  if (outcome.action === 'continue') {
    console.error(
      `[agent-loop] review gate: BLOCKERS (${outcome.gateBlockerCount} gating, ${outcome.totalBlockerCount} total) — continuing for fix round ${outcome.reviewCyclesUsed}/${config.maxReviewCycles} (reasoning ${outcome.reasoningEffort})`,
    )
  }

  return {
    outcome,
    usageSummary,
    reviewLog,
    parsedReview,
    reviewCycle,
  }
}

export function logReviewGateFailureDomain(input: {
  loopDir: string
  iteration: number
  verify: { complete: boolean; reason: string; command: string; exitCode: number | null; stdout: string; stderr: string }
  failureDomainReason: 'review_gate' | 'review_gate_hitl'
}): void {
  logFailureDomainFromVerify(input.loopDir, {
    iteration: input.iteration,
    reason: input.failureDomainReason,
    verify: input.verify,
  })
}

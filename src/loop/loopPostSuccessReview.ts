import { type RepoContext } from '../context/repoContext.js'
import {
  createHitlCheckpoint,
  hitlLoopOverridesFrom,
} from '../integrations/hitlCheckpoint.js'
import { fitHitlCheckDescription } from '../integrations/taskwarrior.js'
import { logFailureDomainFromVerify } from '../loop/loopFailureDomain.js'
import { resolveSecondaryReviewAgent, type ResolvedReviewAgent } from '../loop/loopAgentConfig.js'
import type { LoopConfig } from '../loop/loopConfig.js'
import { resolveShouldRunQualityReview } from '../loop/loopRisk.js'
import { resolveLoopRiskKeywords } from '../loop/loopRiskProfile.js'
import {
  runPostLoopBlockerRecheck,
  runPostLoopQualityReview,
  type PostLoopReviewOptions,
} from '../review/loopPostReview.js'
import type { GuidePacket } from '../review/guidePackets.js'
import { guidePacketsFromReview } from '../review/guidePackets.js'
import type { ParsedReview, ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import {
  blockingBlockers,
  reviewGateBlockers,
  reviewGateBlocksCompletion,
} from '../review/reviewVerdict.js'
import { addUsageRecord, type LoopUsageSummary } from '../usage/loopUsage.js'
import {
  classifyReviewJudgeError,
  formatReviewJudgeErrorClass,
  type ReviewJudgeErrorClass,
} from '../review/reviewJudgeError.js'
import { mergeToolErrorStatRows, type ToolErrorStatRow } from './loopToolErrors.js'

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
      failureDomainReason?: 'review_gate' | 'review_gate_hitl' | 'review_judge_failed'
      /** Park for human when judges fail after verify passed. */
      parkWaiting?: boolean
      reviewJudgeErrorClass?: ReviewJudgeErrorClass
      /** When true, the iteration log was already emitted or should not be written. */
      skipIterationLog?: boolean
    }
  | {
      action: 'continue'
      reviewBlockers: string[]
      guidePackets: GuidePacket[]
      reviewCyclesUsed: number
      reviewLog: PostSuccessReviewLog
      reviewCycle: number
      gateBlockerCount: number
      totalBlockerCount: number
      reasoningEffort: string
    }
  | { action: 'success'; reviewLog?: PostSuccessReviewLog; reviewAdvisoryBlockers?: boolean }

export type PostSuccessReviewInput = {
  config: LoopConfig
  goal: string
  ctx: RepoContext
  loopDir: string
  reviewBlockers: string[] | undefined
  reviewCyclesUsed: number
  reviewAgent: ResolvedReviewAgent
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
  toolErrorStats?: ToolErrorStatRow[]
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
  return fitHitlCheckDescription(`${leading}${body}`)
}

async function buildReviewGateStopOutcome(input: {
  config: LoopConfig
  ctx: RepoContext
  parsedReview: ParsedReview
  reviewCycle: number
  gateLabel: string
  loopDir?: string
}): Promise<PostSuccessReviewOutcome> {
  const { config, ctx, parsedReview, reviewCycle, gateLabel, loopDir } = input
  if (config.reviewGateHitl) {
    const hitlTaskUuid = await createHitlCheckpoint({
      description: reviewGateHitlDescription(parsedReview, reviewCycle),
      reason: 'review_gate',
      ctx,
      loopDir,
      loopOverrides: hitlLoopOverridesFrom(config),
    })
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

export async function resolvePostSuccessReviewOutcome(input: {
  config: LoopConfig
  ctx: RepoContext
  parsedReview: ParsedReview | undefined
  reviewCycle: number
  reviewCyclesUsed: number
  reasoningEffort: string
  loopDir?: string
}): Promise<PostSuccessReviewOutcome> {
  const { config, ctx, parsedReview, reviewCycle, reviewCyclesUsed, reasoningEffort, loopDir } =
    input
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
      loopDir,
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
        loopDir,
      })
    }
    return {
      action: 'continue',
      reviewBlockers: reviewGateBlockers(parsedReview),
      guidePackets: guidePacketsFromReview(parsedReview),
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
    reviewAgent,
    verbose,
    reasoningEffort,
  } = input
  let usageSummary = input.usageSummary

  const riskKeywords = resolveLoopRiskKeywords({
    ctx,
    loopOverride: config.loopRiskProfile,
  })
  const shouldRunReview = resolveShouldRunQualityReview(config, goal, config.verify, {
    profile: riskKeywords,
  })
  if (!shouldRunReview) {
    return { outcome: { action: 'skip' }, usageSummary, reviewCycle: 0 }
  }

  const reviewLabel = config.reviewGate
    ? 'post-success quality review (gated)'
    : 'post-success quality review (advisory)'
  console.error(`[agent-loop] ${reviewLabel}`)

  const useRecheck = config.reviewBlockerRecheck && (reviewBlockers?.length ?? 0) > 0
  let reviewCycle = 0
  let parsedReview: ParsedReview | undefined
  let reviewLog: PostSuccessReviewLog | undefined
  const judgeToolErrorRows: ToolErrorStatRow[] = []

  const baseReviewOptions = {
    verbose,
    workerRuntime: config.runtime,
    reviewReproduce: config.reviewReproduce,
    reviewReproduceAgent: config.reviewReproduceAgent,
    reviewSecondaryRuntime: config.reviewSecondaryRuntime,
    reviewSecondaryModel: config.reviewSecondaryModel,
    reviewGate: config.reviewGate,
  }

  async function invokeReview(
    agent: ResolvedReviewAgent,
    cycle: number,
    extra: Pick<PostLoopReviewOptions, 'skipMergeSecondaryReview'> = {},
  ) {
    const shared = { ...baseReviewOptions, reviewCycle: cycle, reviewAgent: agent, ...extra }
    return useRecheck
      ? await runPostLoopBlockerRecheck(loopDir, goal, ctx, reviewBlockers!, shared)
      : await runPostLoopQualityReview(loopDir, goal, ctx, shared)
  }

  for (;;) {
    reviewCycle++
    let reviewErrorClass: ReviewJudgeErrorClass | undefined
    let reviewSucceeded = false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const reviewResult = await invokeReview(reviewAgent, reviewCycle)
        usageSummary = addUsageRecord(usageSummary, reviewResult.usage)
        if (reviewResult.toolErrorStats?.length) {
          judgeToolErrorRows.push(...reviewResult.toolErrorStats)
        }
        parsedReview = reviewResult.parsed
        reviewSucceeded = true
        break
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        reviewErrorClass = classifyReviewJudgeError(message)
        if (!config.reviewGate) {
          console.error(`[agent-loop] quality review failed (non-blocking): ${message}`)
          return { outcome: { action: 'success' }, usageSummary, reviewCycle }
        }
        if (attempt === 0) {
          console.error(
            `[agent-loop] review gate: judge error (${formatReviewJudgeErrorClass(reviewErrorClass)}) — retrying once: ${message}`,
          )
          continue
        }
        const secondary = resolveSecondaryReviewAgent(config)
        if (secondary) {
          console.error(
            `[agent-loop] review gate: primary judge failed (${formatReviewJudgeErrorClass(reviewErrorClass)}) — falling back to secondary ${secondary.runtime}/${secondary.model}`,
          )
          try {
            const fallback = await invokeReview(secondary, reviewCycle, {
              skipMergeSecondaryReview: true,
            })
            usageSummary = addUsageRecord(usageSummary, fallback.usage)
            if (fallback.toolErrorStats?.length) {
              judgeToolErrorRows.push(...fallback.toolErrorStats)
            }
            parsedReview = fallback.parsed
            reviewSucceeded = true
            break
          } catch (fallbackErr) {
            const fallbackMessage =
              fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
            reviewErrorClass = classifyReviewJudgeError(fallbackMessage)
            console.error(
              `[agent-loop] review gate: secondary judge failed (${formatReviewJudgeErrorClass(reviewErrorClass)}): ${fallbackMessage}`,
            )
          }
        }
        console.error(
          `[agent-loop] review gate: judges unavailable (${formatReviewJudgeErrorClass(reviewErrorClass ?? 'other')}) — parking run`,
        )
        return {
          outcome: {
            action: 'stop',
            completionReason: `Review gate: judges unavailable (${formatReviewJudgeErrorClass(reviewErrorClass ?? 'other')}). Verify passed; re-run after fixing the judge stack.`,
            skipIterationLog: true,
            failureDomainReason: 'review_judge_failed',
            parkWaiting: true,
            reviewJudgeErrorClass: reviewErrorClass,
          },
          usageSummary,
          reviewCycle,
        }
      }
    }
    if (!reviewSucceeded || !parsedReview) {
      break
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

  const outcome = await resolvePostSuccessReviewOutcome({
    config,
    ctx,
    parsedReview,
    reviewCycle,
    reviewCyclesUsed,
    reasoningEffort,
    loopDir,
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
    ...(judgeToolErrorRows.length > 0
      ? { toolErrorStats: mergeToolErrorStatRows(judgeToolErrorRows) }
      : {}),
  }
}

export function logReviewGateFailureDomain(input: {
  loopDir: string
  iteration: number
  verify: { complete: boolean; reason: string; command: string; exitCode: number | null; stdout: string; stderr: string }
  failureDomainReason: 'review_gate' | 'review_gate_hitl' | 'review_judge_failed'
  reviewJudgeErrorClass?: ReviewJudgeErrorClass
}): void {
  const waiting =
    input.failureDomainReason === 'review_gate_hitl' ||
    input.failureDomainReason === 'review_judge_failed'
  logFailureDomainFromVerify(input.loopDir, {
    iteration: input.iteration,
    reason: input.failureDomainReason,
    verify: input.verify,
    ...(waiting ? { status: 'waiting' } : {}),
    ...(input.reviewJudgeErrorClass
      ? {
          suggestion: `Judge error (${formatReviewJudgeErrorClass(input.reviewJudgeErrorClass)}) — verify passed. Fix judge credentials/model or re-run.`,
        }
      : {}),
  })
}

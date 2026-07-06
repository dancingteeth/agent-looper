import fs from 'node:fs'
import { resolveTaskwarriorProject, type RepoContext } from '../context/repoContext.js'
import { createLoopAgentSession, loopRuntimeLabel, type LoopAgentSession } from '../agents/agentRunner.js'
import { resolveIterationAgent, resolveLoopAgent, type ResolvedLoopAgent } from '../loop/loopAgentConfig.js'
import type { LoadedLoopBundle } from '../loop/loopConfig.js'
import { captureGitWorkspaceSnapshot } from '../loop/loopGit.js'
import { buildAgentLoopPrompt } from '../loop/loopPrompt.js'
import { runPostLoopQualityReview } from '../review/loopPostReview.js'
import { resolveShouldRunQualityReview } from '../loop/loopRisk.js'
import type { ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import { reviewGateBlockers, reviewGateBlocksCompletion } from '../review/reviewVerdict.js'
import { detectStagnation } from '../loop/loopStagnation.js'
import { resolveStagnationPolicy } from '../loop/loopStagnationPolicy.js'
import {
  logFailureDomainFromVerify,
  logFailureDomainFromAgentError,
} from '../loop/loopFailureDomain.js'
import { readFailureContext } from '../loop/loopFailureContext.js'
import { pauseForContinue } from '../loop/loopPause.js'
import {
  createHitlCheckTask,
  markTaskwarriorDoneByUuid,
  runTaskwarriorSync,
} from '../integrations/taskwarrior.js'
import { runVerifyCommand, type VerifyResult } from '../loop/loopVerify.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import {
  addUsageRecord,
  emptyUsageSummary,
  logUsageSummary,
  type LoopUsageRecord,
  type LoopUsageSummary,
} from '../usage/loopUsage.js'

export type LoopIterationLog = {
  at: string
  iteration: number
  branch: string
  shortSha: string
  verify: VerifyResult
  finalVerify?: VerifyResult
  assistantPreview: string
  review?: {
    verdict: ReviewVerdict
    risk: ReviewRisk
    blockersCount: number
    reviewCycle?: number
  }
  usage?: LoopUsageRecord
}

export type AgentLoopResult = {
  complete: boolean
  iterations: number
  completionReason: string
  lastVerify: VerifyResult | null
  logPath: string
  usage: LoopUsageSummary
}

export type AgentLoopOptions = {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  onIterationStart?: (iteration: number) => void
}

const PREVIEW_MAX = 500
const SDK_RETRY_DELAYS_MS = [5000, 15_000] as const

function isTransientAgentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /rate limit|timeout|503|502|429|ECONNRESET|ETIMEDOUT|network|retryable=true/i.test(
    message,
  )
}

async function runIterationWithRetry(
  session: LoopAgentSession,
  prompt: string,
  iterationAgent: ResolvedLoopAgent,
  options: { verbose?: boolean; assistantOutput?: 'stdout' | 'none' },
): Promise<AgentRunResult> {
  let lastError: unknown
  for (let attempt = 0; attempt <= SDK_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await session.runIterationPrompt(prompt, iterationAgent, options)
    } catch (err) {
      lastError = err
      if (attempt >= SDK_RETRY_DELAYS_MS.length || !isTransientAgentError(err)) {
        throw err
      }
      const delayMs = SDK_RETRY_DELAYS_MS[attempt]!
      const message = err instanceof Error ? err.message : String(err)
      console.error(
        `[agent-loop] transient agent error (retry ${attempt + 1}/${SDK_RETRY_DELAYS_MS.length} in ${delayMs}ms): ${message}`,
      )
      await sleep(delayMs)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function appendLog(logPath: string, entry: LoopIterationLog): void {
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

function previewAssistant(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= PREVIEW_MAX) return trimmed
  return `${trimmed.slice(0, PREVIEW_MAX)}…`
}

function buildIterationLog(input: {
  iteration: number
  git: ReturnType<typeof captureGitWorkspaceSnapshot>
  verify: VerifyResult
  finalVerify?: VerifyResult
  assistantText: string
  review?: LoopIterationLog['review']
  usage?: LoopUsageRecord
}): LoopIterationLog {
  return {
    at: new Date().toISOString(),
    iteration: input.iteration,
    branch: input.git.branch,
    shortSha: input.git.shortSha,
    verify: input.verify,
    ...(input.finalVerify ? { finalVerify: input.finalVerify } : {}),
    assistantPreview: previewAssistant(input.assistantText),
    ...(input.review ? { review: input.review } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
  }
}

function maybeRunSync(ctx: RepoContext, enabled: boolean): void {
  if (!enabled) return
  const syncCommand = ctx.profile.syncCommand
  if (!syncCommand) {
    console.error('[agent-loop] sync skipped — no syncCommand in .cursor/agent-loop.repo.json')
    return
  }
  runTaskwarriorSync(syncCommand, ctx.repoRoot)
}

async function maybePauseAfterIteration(
  config: LoadedLoopBundle['config'],
  iteration: number,
): Promise<void> {
  if (config.pauseAfterIteration && iteration < config.maxIterations) {
    await pauseForContinue(iteration, config.maxIterations)
  }
}

function readInjectedFailureContext(loopDir: string, enabled: boolean): string | undefined {
  if (!enabled) return undefined
  const context = readFailureContext(loopDir)
  if (!context) {
    console.error(
      '[agent-loop] injectFailureContext=true but failure-context.md is missing or empty',
    )
  }
  return context
}

export async function runAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const { ctx, bundle, verbose = false } = options
  const { repoRoot } = ctx
  const { config, goal, logPath } = bundle
  const agentSession = await createLoopAgentSession(config, ctx)
  const baseAgent = resolveLoopAgent(config)

  console.error(
    `[agent-loop] repo=${repoRoot} runtime=${loopRuntimeLabel(baseAgent.runtime)} model=${baseAgent.model}`,
  )

  const priorFailures: VerifyResult[] = []
  let lastVerify: VerifyResult | null = null
  let iterations = 0
  let reviewBlockers: string[] | undefined
  let reviewCyclesUsed = 0
  let usageSummary = emptyUsageSummary()
  const stagnationThreshold = config.stagnationThreshold

  const finish = (
    result: Omit<AgentLoopResult, 'usage'> & { usage?: LoopUsageSummary },
  ): AgentLoopResult => {
    const usage = result.usage ?? usageSummary
    logUsageSummary('agent-loop', usage)
    return { ...result, usage }
  }

  try {
    for (let i = 1; i <= config.maxIterations; i++) {
      iterations = i
      options.onIterationStart?.(i)

      const repeatCount = detectStagnation(priorFailures, stagnationThreshold).repeatCount
      const stagnation = resolveStagnationPolicy(config, repeatCount)
      const iterationAgent = resolveIterationAgent(config, stagnation.escalationRepeatCount)

      const git = captureGitWorkspaceSnapshot(repoRoot)
      const failureContext = readInjectedFailureContext(
        bundle.loopDir,
        config.injectFailureContext,
      )
      const prompt = buildAgentLoopPrompt({
        goal,
        iteration: i,
        maxIterations: config.maxIterations,
        git,
        lastVerify,
        priorFailures: priorFailures.slice(-3),
        stagnationRepeatCount: stagnation.promptRepeatCount,
        agentsFile: ctx.profile.agentsFile,
        reviewBlockers,
        mode: config.mode,
        failureContext,
      })

      console.error(
        `[agent-loop] iteration ${i}/${config.maxIterations} — ${iterationAgent.runtime} ${iterationAgent.model} (fresh context)`,
      )
      const assistantRun = await runIterationWithRetry(
        agentSession,
        prompt,
        iterationAgent,
        {
          verbose,
          assistantOutput: 'none',
        },
      )
      usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
      const assistantText = assistantRun.text

      if (config.delayMs > 0) {
        await sleep(config.delayMs)
      }

      console.error(`[agent-loop] iteration ${i} — verify: ${config.verify}`)
      const verify = runVerifyCommand(config.verify, repoRoot)
      lastVerify = verify

      let finalVerify: VerifyResult | undefined
      if (verify.complete && config.finalVerify) {
        console.error(`[agent-loop] inner verify passed — final: ${config.finalVerify}`)
        finalVerify = runVerifyCommand(config.finalVerify, repoRoot)
        lastVerify = finalVerify
      }

      const passed = finalVerify ? finalVerify.complete : verify.complete

      let reviewLog: LoopIterationLog['review'] | undefined

      if (passed) {
        const shouldRunReview = resolveShouldRunQualityReview(config, goal, config.verify)
        if (shouldRunReview) {
          const reviewCycle = reviewCyclesUsed + 1
          const reviewLabel = config.reviewGate
            ? 'post-success quality review (gated, Cursor SDK)'
            : 'post-success quality review (advisory, Cursor SDK)'
          console.error(`[agent-loop] ${reviewLabel}`)
          try {
            const reviewResult = await runPostLoopQualityReview(bundle.loopDir, goal, ctx, {
              verbose,
              reviewCycle,
            })
            usageSummary = addUsageRecord(usageSummary, reviewResult.usage)
            const { parsed } = reviewResult
            reviewLog = {
              verdict: parsed.verdict,
              risk: parsed.risk,
              blockersCount: parsed.blockers.length,
              reviewCycle,
            }

            if (config.reviewGate && reviewGateBlocksCompletion(parsed)) {
              const gateBlockers = reviewGateBlockers(parsed)
              reviewCyclesUsed++
              if (reviewCyclesUsed >= config.maxReviewCycles) {
                appendLog(
                  logPath,
                  buildIterationLog({
                    iteration: i,
                    git,
                    verify,
                    finalVerify,
                    assistantText,
                    review: reviewLog,
                    usage: assistantRun.usage,
                  }),
                )
                const gateLabel =
                  parsed.verdict === 'UNKNOWN' ? 'unparseable verdict' : 'BLOCKERS'
                console.error(
                  `[agent-loop] review gate: ${gateLabel} after ${reviewCyclesUsed} review cycle(s) — stopping`,
                )
                logFailureDomainFromVerify(bundle.loopDir, {
                  iteration: i,
                  reason: 'review_gate',
                  verify: finalVerify ?? verify,
                })
                return finish({
                  complete: false,
                  iterations: i,
                  completionReason: `Review gate: ${gateLabel} after ${reviewCyclesUsed} review cycle(s). See review.md and fix blockers manually or increase maxReviewCycles.`,
                  lastVerify,
                  logPath,
                })
              }
              reviewBlockers = gateBlockers
              appendLog(
                logPath,
                buildIterationLog({
                  iteration: i,
                  git,
                  verify,
                  finalVerify,
                  assistantText,
                  review: reviewLog,
                  usage: assistantRun.usage,
                }),
              )
              const gateLabel =
                parsed.verdict === 'UNKNOWN'
                  ? 'unparseable verdict'
                  : `BLOCKERS (${gateBlockers.length} items)`
              console.error(
                `[agent-loop] review gate: ${gateLabel} — continuing for fix round ${reviewCyclesUsed}/${config.maxReviewCycles}`,
              )
              await maybePauseAfterIteration(config, i)
              continue
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            if (config.reviewGate) {
              console.error(`[agent-loop] review gate: quality review failed — stopping: ${message}`)
              return finish({
                complete: false,
                iterations: i,
                completionReason: `Review gate: quality review failed: ${message}`,
                lastVerify,
                logPath,
              })
            }
            console.error(`[agent-loop] quality review failed (non-blocking): ${message}`)
          }
        }

        appendLog(
          logPath,
          buildIterationLog({
            iteration: i,
            git,
            verify,
            finalVerify,
            assistantText,
            review: reviewLog,
            usage: assistantRun.usage,
          }),
        )
        if (config.taskwarriorUuid) {
          markTaskwarriorDoneByUuid(config.taskwarriorUuid)
        }
        if (config.hitlCheck) {
          createHitlCheckTask(
            config.hitlCheck,
            resolveTaskwarriorProject(config.taskwarriorProject, ctx.profile),
          )
        }
        maybeRunSync(ctx, config.syncOnSuccess)
        return finish({
          complete: true,
          iterations: i,
          completionReason: lastVerify!.reason,
          lastVerify,
          logPath,
        })
      }

      appendLog(
        logPath,
        buildIterationLog({
          iteration: i,
          git,
          verify,
          finalVerify,
          assistantText,
          usage: assistantRun.usage,
        }),
      )

      priorFailures.push(lastVerify!)
      console.error(`[agent-loop] iteration ${i} failed — ${lastVerify!.reason}`)

      await maybePauseAfterIteration(config, i)

      const afterFailure = detectStagnation(priorFailures, stagnationThreshold)
      if (afterFailure.stagnant) {
        console.error(
          `[agent-loop] stagnation: same verifier failure ${afterFailure.repeatCount} times — stopping early`,
        )
        logFailureDomainFromVerify(bundle.loopDir, {
          iteration: i,
          reason: 'stagnation',
          verify: lastVerify!,
          repeatCount: afterFailure.repeatCount,
        })
        return finish({
          complete: false,
          iterations: i,
          completionReason: `Stagnation: verifier failed ${afterFailure.repeatCount} times with the same output. Update GOAL.md/verify, fix manually, or set stagnationThreshold: 0 to disable.`,
          lastVerify,
          logPath,
        })
      }
    }

    if (lastVerify) {
      logFailureDomainFromVerify(bundle.loopDir, {
        iteration: iterations,
        reason: 'max_iterations',
        verify: lastVerify,
      })
    }

    return finish({
      complete: false,
      iterations,
      completionReason: `Max iterations (${config.maxIterations}) reached without passing verifier.`,
      lastVerify,
      logPath,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[agent-loop] agent SDK error during iteration ${iterations}: ${message}`)
    logFailureDomainFromAgentError(bundle.loopDir, { iteration: iterations, message })
    return finish({
      complete: false,
      iterations,
      completionReason: `Agent SDK error during iteration ${iterations}: ${message}`,
      lastVerify,
      logPath,
    })
  } finally {
    await agentSession.dispose()
  }
}

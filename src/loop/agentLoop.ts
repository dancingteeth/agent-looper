import fs from 'node:fs'
import { resolveTaskwarriorProject, type RepoContext } from '../context/repoContext.js'
import { createLoopAgentSession, loopRuntimeLabel, type LoopAgentSession } from '../agents/agentRunner.js'
import { resolveIterationAgent, resolveLoopAgent, resolveReviewModel, type ResolvedLoopAgent } from '../loop/loopAgentConfig.js'
import type { LoadedLoopBundle } from '../loop/loopConfig.js'
import { captureGitWorkspaceSnapshot } from '../loop/loopGit.js'
import { buildAgentLoopPrompt } from '../loop/loopPrompt.js'
import { runPostLoopQualityReview, runPostLoopBlockerRecheck } from '../review/loopPostReview.js'
import { resolveShouldRunQualityReview } from '../loop/loopRisk.js'
import type { ParsedReview, ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import { reviewGateBlockers, reviewGateBlocksCompletion, blockingBlockers } from '../review/reviewVerdict.js'
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
import type { InnerAgentStatus } from '../agents/innerAgentStatus.js'
import { previewAssistantText } from '../agents/innerAgentStatus.js'
import {
  persistVerifyOutput,
  runPostVerifierExtensionHooks,
  siblingReposForIterationLog,
  type SiblingRepoRef,
  type VerifyLogRefs,
} from './loopExtensions.js'
import { loadLoopSkillSection, resolveLoopSkillPaths } from './loopSkills.js'
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
  verifyLog?: VerifyLogRefs
  siblingRepos?: SiblingRepoRef[]
  assistantPreview: string
  innerAgent?: InnerAgentStatus
  review?: {
    verdict: ReviewVerdict
    risk: ReviewRisk
    blockersCount: number
    reviewCycle?: number
  }
  usage?: LoopUsageRecord
  /** Resolved model for the iteration (e.g. cline-pass/deepseek-v4-flash or escalated qwen). */
  model?: string
  /** Resolved reasoning tier for the iteration; 'default' when none was requested. */
  reasoningEffort?: string
}

export type AgentLoopResult = {
  complete: boolean
  iterations: number
  completionReason: string
  lastVerify: VerifyResult | null
  logPath: string
  usage: LoopUsageSummary
  /** True when review returned BLOCKERS but reviewGate was off (advisory only). */
  reviewAdvisoryBlockers?: boolean
  /** True when the last iteration's inner agent (e.g. Cline) did not complete cleanly. */
  innerAgentIncomplete?: boolean
  /** Taskwarrior UUID when hitlCheck created a manual validation task. */
  hitlCheckTaskUuid?: string
  /** True when the review gate exhausted and was escalated to a human (HITL) instead of hard-failing. */
  reviewEscalatedToHitl?: boolean
}

export type AgentLoopOptions = {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  onIterationStart?: (iteration: number) => void
}

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

function reviewGateHitlDescription(parsed: ParsedReview, reviewCycle: number): string {
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

function appendLog(logPath: string, entry: LoopIterationLog): void {
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

function buildIterationLog(input: {
  iteration: number
  git: ReturnType<typeof captureGitWorkspaceSnapshot>
  verify: VerifyResult
  finalVerify?: VerifyResult
  verifyLog?: VerifyLogRefs
  siblingRepos?: SiblingRepoRef[]
  assistantText: string
  innerAgent?: InnerAgentStatus
  review?: LoopIterationLog['review']
  usage?: LoopUsageRecord
  model?: string
  reasoningEffort?: string
}): LoopIterationLog {
  return {
    at: new Date().toISOString(),
    iteration: input.iteration,
    branch: input.git.branch,
    shortSha: input.git.shortSha,
    verify: input.verify,
    ...(input.finalVerify ? { finalVerify: input.finalVerify } : {}),
    ...(input.verifyLog ? { verifyLog: input.verifyLog } : {}),
    ...(input.siblingRepos ? { siblingRepos: input.siblingRepos } : {}),
    assistantPreview: previewAssistantText(input.assistantText, input.innerAgent),
    ...(input.innerAgent ? { innerAgent: input.innerAgent } : {}),
    ...(input.review ? { review: input.review } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
  }
}

function prepareVerifyForLog(
  loopDir: string,
  iteration: number,
  verify: VerifyResult,
  verifyLogMode: LoadedLoopBundle['config']['verifyLogMode'],
): { verify: VerifyResult; verifyLog?: VerifyLogRefs } {
  return persistVerifyOutput(loopDir, iteration, verify, verifyLogMode)
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
  const skillsSection = loadLoopSkillSection(
    repoRoot,
    resolveLoopSkillPaths(goal, config.skills),
  )
  if (skillsSection) {
    const skillCount = resolveLoopSkillPaths(goal, config.skills).length
    console.error(`[agent-loop] inlined ${skillCount} skill runbook(s) into iteration prompts`)
  }
  const agentSession = await createLoopAgentSession(config, ctx)
  const baseAgent = resolveLoopAgent(config)
  const reviewModel = resolveReviewModel(config)

  console.error(
    `[agent-loop] repo=${repoRoot} runtime=${loopRuntimeLabel(baseAgent.runtime)} ` +
      `worker=${baseAgent.model} review=${reviewModel}`,
  )

  const priorFailures: VerifyResult[] = []
  let lastVerify: VerifyResult | null = null
  let iterations = 0
  let reviewBlockers: string[] | undefined
  let reviewCyclesUsed = 0
  let reviewAdvisoryBlockers = false
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
      const iterationAgent = resolveIterationAgent(
        config,
        i,
        stagnation.escalationRepeatCount,
        reviewCyclesUsed,
      )

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
        skillsSection,
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
      const innerAgent = assistantRun.innerAgent

      if (innerAgent && !innerAgent.complete) {
        console.error(
          `[agent-loop] warn: ${innerAgent.reason ?? 'inner agent incomplete'} (outer verifier may still pass)`,
        )
      }

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
      const siblingRepos = siblingReposForIterationLog(config)
      const verifyPersisted = prepareVerifyForLog(bundle.loopDir, i, verify, config.verifyLogMode)
      const verifyForLog = verifyPersisted.verify
      const verifyLog = verifyPersisted.verifyLog
      let finalVerifyForLog: VerifyResult | undefined
      if (finalVerify) {
        const finalPersisted = prepareVerifyForLog(
          bundle.loopDir,
          i,
          finalVerify,
          config.verifyLogMode,
        )
        finalVerifyForLog = finalPersisted.verify
      }

      if (passed) {
        runPostVerifierExtensionHooks(config, repoRoot)
      }

      let reviewLog: LoopIterationLog['review'] | undefined
      let parsedReview: ParsedReview | undefined

      if (passed) {
        const shouldRunReview = resolveShouldRunQualityReview(config, goal, config.verify)
        if (shouldRunReview) {
          const reviewLabel = config.reviewGate
            ? 'post-success quality review (gated, Cursor SDK)'
            : 'post-success quality review (advisory, Cursor SDK)'
          console.error(`[agent-loop] ${reviewLabel}`)

          // On a fix round (reviewBlockers set from a prior BLOCKERS verdict) run the
          // lighter, scope-limited blocker re-check instead of the full review: it only
          // judges whether the flagged blockers are resolved, so the model cannot block
          // completion on a *new* irrelevant finding. UNKNOWN verdicts are a transient
          // parse glitch — retry up to unparseableReviewRetries, then treat as terminal.
          // The iteration limit stays the ultimate backstop even when a model flags
          // irrelevant blockers.
          const useRecheck =
            config.reviewBlockerRecheck && (reviewBlockers?.length ?? 0) > 0
          let reviewCycle = 0
          for (;;) {
            reviewCycle++
            try {
              const reviewResult = useRecheck
                ? await runPostLoopBlockerRecheck(bundle.loopDir, goal, ctx, reviewBlockers!, {
                    verbose,
                    reviewCycle,
                    reviewModel,
                    reviewReproduce: config.reviewReproduce,
                  })
                : await runPostLoopQualityReview(bundle.loopDir, goal, ctx, {
                    verbose,
                    reviewCycle,
                    reviewModel,
                    reviewReproduce: config.reviewReproduce,
                  })
              usageSummary = addUsageRecord(usageSummary, reviewResult.usage)
              parsedReview = reviewResult.parsed
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

          // Terminal gate outcome (hard-fail or HITL escalation) for a blocker that
          // persisted or an unparseable verdict that exhausted retries.
          const gateStop = (gateLabel: string): AgentLoopResult => {
            appendLog(
              logPath,
              buildIterationLog({
                iteration: i,
                git,
                verify: verifyForLog,
                finalVerify: finalVerifyForLog,
                verifyLog,
                siblingRepos,
                assistantText,
                innerAgent,
                review: reviewLog,
                usage: assistantRun.usage,
                model: iterationAgent.model,
                reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
              }),
            )
            // Escalate to a human instead of dead-ending: a person decides whether the
            // (possibly irrelevant) blockers are real. Keeps a frontier model out of the
            // loop-closing decision.
            if (config.reviewGateHitl) {
              let hitlTaskUuid: string | undefined
              try {
                hitlTaskUuid = createHitlCheckTask(
                  reviewGateHitlDescription(parsedReview!, reviewCycle),
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
                logFailureDomainFromVerify(bundle.loopDir, {
                  iteration: i,
                  reason: 'review_gate_hitl',
                  verify: finalVerify ?? verify,
                })
                return finish({
                  complete: false,
                  iterations: i,
                  completionReason: `Review gate: ${gateLabel} after ${reviewCycle} review cycle(s) — escalated to human review. See review.md; a HITL task was created.`,
                  lastVerify,
                  logPath,
                  hitlCheckTaskUuid: hitlTaskUuid,
                  reviewEscalatedToHitl: true,
                })
              }
            }
            console.error(
              `[agent-loop] review gate: ${gateLabel} after ${reviewCycle} cycle(s) — stopping`,
            )
            logFailureDomainFromVerify(bundle.loopDir, {
              iteration: i,
              reason: 'review_gate',
              verify: finalVerify ?? verify,
            })
            return finish({
              complete: false,
              iterations: i,
              completionReason: `Review gate: ${gateLabel} after ${reviewCycle} review cycle(s). See review.md and fix blockers manually or increase maxReviewCycles.`,
              lastVerify,
              logPath,
            })
          }

          if (!parsedReview) {
            // Review threw (non-gate) — fall through to success; nothing to gate.
          } else if (parsedReview.verdict === 'UNKNOWN') {
            // Unparseable after retries: terminal. Never a fix round, so the synthetic
            // UNPARSEABLE_VERDICT_BLOCKER is never injected into the next agent prompt.
            return gateStop('unparseable verdict')
          } else if (config.reviewGate && reviewGateBlocksCompletion(parsedReview)) {
            const gateBlockerCount = blockingBlockers(parsedReview).length
            reviewCyclesUsed++
            const blockerRoundsExhausted = reviewCyclesUsed >= config.maxReviewCycles
            if (blockerRoundsExhausted) {
              return gateStop(`BLOCKERS (${gateBlockerCount} gating item(s))`)
            }
            reviewBlockers = reviewGateBlockers(parsedReview)
            appendLog(
              logPath,
              buildIterationLog({
                iteration: i,
                git,
                verify: verifyForLog,
                finalVerify: finalVerifyForLog,
                verifyLog,
                siblingRepos,
                assistantText,
                innerAgent,
                review: reviewLog,
                usage: assistantRun.usage,
                model: iterationAgent.model,
                reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
              }),
            )
            console.error(
              `[agent-loop] review gate: BLOCKERS (${gateBlockerCount} gating, ${parsedReview.blockers.length} total) — continuing for fix round ${reviewCyclesUsed}/${config.maxReviewCycles} (reasoning ${iterationAgent.reasoningEffort ?? 'default'})`,
            )
            await maybePauseAfterIteration(config, i)
            continue
          } else if (
            config.reviewGate &&
            parsedReview.verdict === 'BLOCKERS' &&
            parsedReview.blockers.length > 0
          ) {
            reviewAdvisoryBlockers = true
            console.error(
              `[agent-loop] review gate: BLOCKERS verdict but only warning/none-impact items (${parsedReview.blockers.length}) — loop completes`,
            )
          } else if (!config.reviewGate && parsedReview.verdict === 'BLOCKERS') {
            reviewAdvisoryBlockers = true
            console.error(
              `[agent-loop] advisory review: BLOCKERS (${parsedReview.blockers.length}) — loop still completes (reviewGate=false; set reviewGate=true to enforce)`,
            )
          }
        }
        appendLog(
          logPath,
          buildIterationLog({
            iteration: i,
            git,
            verify: verifyForLog,
            finalVerify: finalVerifyForLog,
            verifyLog,
            siblingRepos,
            assistantText,
            innerAgent,
            review: reviewLog,
            usage: assistantRun.usage,
            model: iterationAgent.model,
            reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
          }),
        )
        if (config.taskwarriorUuid) {
          markTaskwarriorDoneByUuid(config.taskwarriorUuid)
        }
        let hitlCheckTaskUuid: string | undefined
        if (config.hitlCheck) {
          hitlCheckTaskUuid = createHitlCheckTask(
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
          ...(reviewAdvisoryBlockers ? { reviewAdvisoryBlockers: true } : {}),
          ...(innerAgent && !innerAgent.complete ? { innerAgentIncomplete: true } : {}),
          ...(hitlCheckTaskUuid ? { hitlCheckTaskUuid } : {}),
        })
      }

      appendLog(
        logPath,
        buildIterationLog({
          iteration: i,
          git,
          verify: verifyForLog,
          finalVerify: finalVerifyForLog,
          verifyLog,
          siblingRepos,
          assistantText,
          innerAgent,
          usage: assistantRun.usage,
          model: iterationAgent.model,
          reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
        }),
      )

      // A verifier failure starts a fresh attempt — drop any review-blocker
      // reasoning escalation and stale blocker list from the previous
      // (passing-verify) fix rounds.
      reviewCyclesUsed = 0
      reviewBlockers = undefined
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

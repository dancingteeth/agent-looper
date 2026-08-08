import fs from 'node:fs'
import path from 'node:path'
import { type RepoContext } from '../context/repoContext.js'
import { createLoopAgentSession, loopRuntimeLabel, type LoopAgentSession } from '../agents/agentRunner.js'
import { resolveIterationAgent, resolveLoopAgent, resolveReviewAgent, type ResolvedLoopAgent } from '../loop/loopAgentConfig.js'
import type { LoadedLoopBundle } from '../loop/loopConfig.js'
import { captureGitWorkspaceSnapshot } from '../loop/loopGit.js'
import { buildAgentLoopPrompt } from '../loop/loopPrompt.js'
import type { ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import { detectStagnation } from '../loop/loopStagnation.js'
import { resolveStagnationPolicy } from '../loop/loopStagnationPolicy.js'
import {
  logFailureDomainFromVerify,
  logFailureDomainFromAgentError,
} from '../loop/loopFailureDomain.js'
import { readFailureContext } from '../loop/loopFailureContext.js'
import { pauseForContinue } from '../loop/loopPause.js'
import {
  createHitlCheckpoint,
  hitlLoopOverridesFrom,
} from '../integrations/hitlCheckpoint.js'
import { markTaskwarriorDoneByUuid, runTaskwarriorSync } from '../integrations/taskwarrior.js'
import {
  logReviewGateFailureDomain,
  runPostSuccessReviewPhase,
} from '../loop/loopPostSuccessReview.js'
import type { GuidePacket } from '../review/guidePackets.js'
import { runVerifyCommand, type VerifyResult } from '../loop/loopVerify.js'
import { runVerifySkill } from '../loop/loopVerifySkill.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import type { InnerAgentStatus } from '../agents/innerAgentStatus.js'
import { previewAssistantText } from '../agents/innerAgentStatus.js'
import {
  formatLoopExtensionPreflight,
  persistVerifyOutput,
  runPostVerifierExtensionHooks,
  siblingReposForIterationLog,
  validateLoopExtensionPreflight,
  type SiblingRepoRef,
  type VerifyLogRefs,
} from './loopExtensions.js'
import { loadConfiguredAgentPlugins } from '../plugins/agentPluginsLoad.js'
import { loadLoopSkillSection, resolveLoopSkillPaths } from './loopSkills.js'
import {
  addUsageRecord,
  emptyUsageSummary,
  logUsageSummary,
  type LoopUsageRecord,
  type LoopUsageSummary,
} from '../usage/loopUsage.js'
import { StreamCollector, type AgentSessionRef, type TranscriptEvent } from '../stream/streamCollect.js'
import { writeRunReportArtifacts } from './loopRunReport.js'

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
  workerSession?: AgentSessionRef
  toolSummary?: Record<string, number>
}

/**
 * Run lifecycle (additive; `complete` remains the boolean API).
 * - done — verify (+ optional review) succeeded
 * - waiting — parked for human (reviewGateHitl)
 * - continue — incomplete; re-run or fix manually (stagnation, max iters, hard-fail gate)
 */
export type LoopRunStatus = 'done' | 'continue' | 'waiting'

export type AgentLoopResult = {
  complete: boolean
  /** Derived lifecycle status — prefer this for HITL-aware consumers. */
  status: LoopRunStatus
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

export function deriveLoopRunStatus(
  result: Pick<AgentLoopResult, 'complete' | 'reviewEscalatedToHitl'>,
): LoopRunStatus {
  if (result.complete) return 'done'
  if (result.reviewEscalatedToHitl) return 'waiting'
  return 'continue'
}

export type AgentLoopOptions = {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  /** Optional per-batch fan-out rubric injected into worker prompts. */
  batchRubric?: string
  onIterationStart?: (iteration: number) => void
}

const SDK_RETRY_DELAYS_MS = [5000, 15_000] as const

/**
 * Heuristic for retryable provider errors. Deliberately narrow: bare substrings
 * like `network` or `503` anywhere in a message produced false positives (paths,
 * validation errors) and burned retries on permanent failures. Internal long-run
 * timeouts ("timed out after …ms") intentionally do NOT match — a 45-minute run
 * should not be repeated blindly.
 */
const TRANSIENT_AGENT_ERROR_PATTERN =
  /rate.?limit|\b429\b|\b50[234]\b|\bECONNRESET\b|\bETIMEDOUT\b|\bEAI_AGAIN\b|socket hang up|fetch failed|\btimeout\b|retryable=true/i

export function isTransientAgentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return TRANSIENT_AGENT_ERROR_PATTERN.test(message)
}

async function runIterationWithRetry(
  session: LoopAgentSession,
  prompt: string,
  iterationAgent: ResolvedLoopAgent,
  options: { verbose?: boolean; assistantOutput?: 'stdout' | 'none'; collector?: StreamCollector },
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
  workerSession?: AgentSessionRef
  toolSummary?: Record<string, number>
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
    ...(input.model ? { model: input.model } : {}),
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.workerSession ? { workerSession: input.workerSession } : {}),
    ...(input.toolSummary ? { toolSummary: input.toolSummary } : {}),
  }
}

/** Persist verify (+ optional finalVerify) output per verifyLogMode; returns log-ready copies. */
function persistVerifyResultsForLog(
  loopDir: string,
  iteration: number,
  verify: VerifyResult,
  finalVerify: VerifyResult | undefined,
  verifyLogMode: LoadedLoopBundle['config']['verifyLogMode'],
): { verifyForLog: VerifyResult; verifyLog?: VerifyLogRefs; finalVerifyForLog?: VerifyResult } {
  const persisted = persistVerifyOutput(loopDir, iteration, verify, verifyLogMode)
  return {
    verifyForLog: persisted.verify,
    verifyLog: persisted.verifyLog,
    ...(finalVerify
      ? {
          finalVerifyForLog: persistVerifyOutput(loopDir, iteration, finalVerify, verifyLogMode)
            .verify,
        }
      : {}),
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

  // Surface reserved/experimental extension fields on the library path too —
  // batch and meta loops reach this without going through the CLI preflight.
  const extensionPreflight = validateLoopExtensionPreflight(ctx, config)
  if (extensionPreflight.warnings.length > 0 || extensionPreflight.pendingFeatures.length > 0) {
    console.error('[agent-loop] loop extension preflight:')
    console.error(formatLoopExtensionPreflight(extensionPreflight))
  }

  const pluginLoad = loadConfiguredAgentPlugins(repoRoot, config.plugins)
  for (const warning of pluginLoad.warnings) {
    console.error(`[agent-loop] ${warning}`)
  }
  if (pluginLoad.plugins.length > 0) {
    console.error(
      `[agent-loop] loaded ${pluginLoad.plugins.length} Agent Plugin(s) ` +
        `(${pluginLoad.skillRelativePaths.length} skill path(s))`,
    )
  }

  const skillPaths = resolveLoopSkillPaths(goal, [
    ...pluginLoad.skillRelativePaths,
    ...(config.skills ?? []),
  ])
  const skillsSection = loadLoopSkillSection(repoRoot, skillPaths)
  if (skillsSection) {
    console.error(`[agent-loop] inlined ${skillPaths.length} skill runbook(s) into iteration prompts`)
  }
  const agentSession = await createLoopAgentSession(config, ctx)
  const baseAgent = resolveLoopAgent(config)
  const reviewAgent = resolveReviewAgent(config)

  console.error(
    `[agent-loop] repo=${repoRoot} runtime=${loopRuntimeLabel(baseAgent.runtime)} ` +
      `worker=${baseAgent.model} review=${loopRuntimeLabel(reviewAgent.runtime)}/${reviewAgent.model} verify mode=${config.verifyMode}`,
  )

  const priorFailures: VerifyResult[] = []
  let lastVerify: VerifyResult | null = null
  let iterations = 0
  let reviewBlockers: string[] | undefined
  let guidePackets: GuidePacket[] | undefined
  let reviewCyclesUsed = 0
  let reviewAdvisoryBlockers = false
  let usageSummary = emptyUsageSummary()
  const transcriptEvents: TranscriptEvent[] = []
  const stagnationThreshold = config.stagnationThreshold

  const finish = (
    result: Omit<AgentLoopResult, 'usage' | 'status'> & {
      usage?: LoopUsageSummary
      status?: LoopRunStatus
    },
  ): AgentLoopResult => {
    const usage = result.usage ?? usageSummary
    logUsageSummary('agent-loop', usage)
    const status = result.status ?? deriveLoopRunStatus(result)
    const finalResult: AgentLoopResult = { ...result, usage, status }
    if (config.exportRunReport) {
      const { reportPath, transcriptPath } = writeRunReportArtifacts({
        ctx,
        loopDir: bundle.loopDir,
        goal,
        config,
        result: finalResult,
        workerModel: baseAgent.model,
        reviewRuntime: reviewAgent.runtime,
        reviewModel: reviewAgent.model,
        runtime: config.runtime,
        transcriptEvents,
      })
      console.error(
        `[agent-loop] run report: ${path.relative(repoRoot, reportPath)}`,
      )
      if (transcriptPath) {
        console.error(
          `[agent-loop] transcript: ${path.relative(repoRoot, transcriptPath)}`,
        )
      }
    }
    return finalResult
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
        guidePackets,
        skillsSection,
        batchRubric: options.batchRubric,
        mode: config.mode,
        failureContext,
      })

      console.error(
        `[agent-loop] iteration ${i}/${config.maxIterations} — ${iterationAgent.runtime} ${iterationAgent.model} (fresh context)`,
      )
      const collector = config.exportTranscript
        ? new StreamCollector({ phase: 'implement', iteration: i })
        : undefined
      const assistantRun = await runIterationWithRetry(
        agentSession,
        prompt,
        iterationAgent,
        {
          verbose,
          assistantOutput: 'none',
          collector,
        },
      )
      usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
      const assistantText = assistantRun.text
      const innerAgent = assistantRun.innerAgent
      if (assistantRun.transcriptEvents?.length) {
        transcriptEvents.push(...assistantRun.transcriptEvents)
      }
      const workerLogFields = {
        workerSession: assistantRun.sessionRef,
        toolSummary: assistantRun.toolSummary,
      }

      if (innerAgent && !innerAgent.complete) {
        console.error(
          `[agent-loop] warn: ${innerAgent.reason ?? 'inner agent incomplete'} (outer verifier may still pass)`,
        )
      }

      if (config.delayMs > 0) {
        await sleep(config.delayMs)
      }

      console.error(`[agent-loop] iteration ${i} — verify: ${config.verify}`)
      const verify =
        config.verifyMode === 'skill'
          ? await runVerifySkill({
              ctx,
              loopDir: bundle.loopDir,
              goal,
              config,
              verbose,
            })
          : runVerifyCommand(config.verify, repoRoot)
      lastVerify = verify

      let finalVerify: VerifyResult | undefined
      if (verify.complete && config.finalVerify) {
        console.error(`[agent-loop] inner verify passed — final: ${config.finalVerify}`)
        finalVerify = runVerifyCommand(config.finalVerify, repoRoot)
        lastVerify = finalVerify
      }

      const passed = finalVerify ? finalVerify.complete : verify.complete
      const siblingRepos = siblingReposForIterationLog(config)
      const { verifyForLog, verifyLog, finalVerifyForLog } = persistVerifyResultsForLog(
        bundle.loopDir,
        i,
        verify,
        finalVerify,
        config.verifyLogMode,
      )

      if (passed) {
        runPostVerifierExtensionHooks(config, repoRoot)
      }

      let reviewLog: LoopIterationLog['review'] | undefined

      // Every iteration-log call site below shares these fields; only `review` varies.
      const appendCurrentIterationLog = (review?: LoopIterationLog['review']): void => {
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
            review,
            usage: assistantRun.usage,
            model: iterationAgent.model,
            reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
            ...workerLogFields,
          }),
        )
      }

      if (passed) {
        const reviewPhase = await runPostSuccessReviewPhase({
          config,
          goal,
          ctx,
          loopDir: bundle.loopDir,
          reviewBlockers,
          reviewCyclesUsed,
          reviewAgent,
          verbose,
          usageSummary,
          reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
        })
        usageSummary = reviewPhase.usageSummary
        reviewLog = reviewPhase.reviewLog

        if (reviewPhase.outcome.action === 'stop') {
          if (!reviewPhase.outcome.skipIterationLog) {
            appendCurrentIterationLog(reviewLog)
          }
          if (reviewPhase.outcome.failureDomainReason) {
            logReviewGateFailureDomain({
              loopDir: bundle.loopDir,
              iteration: i,
              verify: finalVerify ?? verify,
              failureDomainReason: reviewPhase.outcome.failureDomainReason,
            })
          }
          return finish({
            complete: false,
            iterations: i,
            completionReason: reviewPhase.outcome.completionReason,
            lastVerify,
            logPath,
            ...(reviewPhase.outcome.hitlCheckTaskUuid
              ? { hitlCheckTaskUuid: reviewPhase.outcome.hitlCheckTaskUuid }
              : {}),
            ...(reviewPhase.outcome.reviewEscalatedToHitl
              ? { reviewEscalatedToHitl: true }
              : {}),
          })
        }

        if (reviewPhase.outcome.action === 'continue') {
          reviewBlockers = reviewPhase.outcome.reviewBlockers
          guidePackets = reviewPhase.outcome.guidePackets
          reviewCyclesUsed = reviewPhase.outcome.reviewCyclesUsed
          reviewLog = reviewPhase.outcome.reviewLog
          appendCurrentIterationLog(reviewLog)
          await maybePauseAfterIteration(config, i)
          continue
        }

        if (reviewPhase.outcome.action === 'success' && reviewPhase.outcome.reviewAdvisoryBlockers) {
          reviewAdvisoryBlockers = true
        }

        appendCurrentIterationLog(reviewLog)
        if (config.taskwarriorUuid) {
          markTaskwarriorDoneByUuid(config.taskwarriorUuid)
        }
        let hitlCheckTaskUuid: string | undefined
        if (config.hitlCheck) {
          hitlCheckTaskUuid = await createHitlCheckpoint({
            description: config.hitlCheck,
            reason: 'post_success',
            ctx,
            loopDir: bundle.loopDir,
            loopOverrides: hitlLoopOverridesFrom(config),
          })
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

      appendCurrentIterationLog()

      // A verifier failure starts a fresh attempt — drop any review-blocker
      // reasoning escalation and stale blocker list from the previous
      // (passing-verify) fix rounds.
      reviewCyclesUsed = 0
      reviewBlockers = undefined
      guidePackets = undefined
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

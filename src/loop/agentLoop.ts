import path from 'node:path'
import { type RepoContext } from '../context/repoContext.js'
import { createLoopAgentSession, loopRuntimeLabel, type LoopAgentSession } from '../agents/agentRunner.js'
import { formatErrorChain } from '../agents/errorFormat.js'
import { appendJsonlLine } from './appendJsonl.js'
import { resolveLoopAgent, resolveReviewAgent } from './loopAgentConfig.js'
import { resolveIterationAgent } from './loopAgentEscalation.js'
import type { LoadedLoopBundle } from './loopConfig.js'
import { captureGitWorkspaceSnapshot } from './loopGit.js'
import { buildAgentLoopPrompt } from './loopPrompt.js'
import { loadLoopResearchSection, resolveLoopResearchRelativePath } from './loopResearch.js'
import { detectStagnation } from './loopStagnation.js'
import { resolveStagnationPolicy } from './loopStagnationPolicy.js'
import { logFailureDomainFromVerify, logFailureDomainFromAgentError } from './loopFailureDomain.js'
import { readFailureContext } from './loopFailureContext.js'
import { pauseForContinue } from './loopPause.js'
import { createHitlCheckpoint, hitlLoopOverridesFrom } from '../integrations/hitlCheckpoint.js'
import { markTaskwarriorDoneByUuid, runTaskwarriorSync } from '../integrations/taskwarrior.js'
import { logReviewGateFailureDomain, runPostSuccessReviewPhase } from './loopPostSuccessReview.js'
import type { GuidePacket } from '../review/guidePackets.js'
import { runVerifyCommand, type VerifyResult } from './loopVerify.js'
import { attachVerifyClass, isEnvVerifyFailure } from './verifyClass.js'
import { resolveLoopSetupCommand, runLoopSetup } from './loopSetup.js'
import {
  frozenFilesVerifyResult,
  restoreFrozenFiles,
  snapshotFrozenFiles,
  type FrozenFileSnapshot,
} from './loopFrozenFiles.js'
import { runVerifySkill } from './loopVerifySkill.js'
import type { AgentRunResult } from '../agents/agentRunResult.js'
import {
  formatLoopExtensionPreflight,
  runPostVerifierExtensionHooks,
  siblingReposForIterationLog,
  validateLoopExtensionPreflight,
  SKILL_DISCLOSURE_INLINE,
} from './loopExtensions.js'
import { loadConfiguredAgentPlugins } from '../plugins/agentPluginsLoad.js'
import { installLoopAssistantStream, resetAssistantStream } from './grindStream.js'
import { loadLoopSkillSection, resolveLoopSkillPaths } from './loopSkills.js'
import { addUsageRecord, emptyUsageSummary, logUsageSummary, type LoopUsageSummary } from '../usage/loopUsage.js'
import { StreamCollector, type TranscriptEvent } from '../stream/streamCollect.js'
import { writeRunReportArtifacts } from './loopRunReport.js'
import { writeLoopExportPack } from '../integrations/loopExportPack.js'
import {
  budgetCompletionReason,
  budgetCrossed,
  nextWorkerBudgetRefusal,
  unpricedModelWarnings,
} from './loopBudgetGuard.js'
import { buildIterationLog, persistVerifyResultsForLog, type LoopIterationLog } from './loopIterationLog.js'
import {
  recycleWorkerSession,
  runIterationWithRetry,
  shouldEscalateAfterWorkerFault,
  sleep,
  workerSdkVerifyResult,
} from './loopWorkerRetry.js'

export type { LoopIterationLog } from './loopIterationLog.js'

/**
 * Run lifecycle (additive; `complete` remains the boolean API).
 * - done — verify (+ optional review) succeeded
 * - waiting — parked for human (reviewGateHitl, verify_env, setup, budget)
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
  /** Harness bootstrap result when `setup` / `setup.sh` ran. */
  setup?: VerifyResult
}

export function deriveLoopRunStatus(
  result: Pick<AgentLoopResult, 'complete' | 'reviewEscalatedToHitl'> &
    Partial<Pick<AgentLoopResult, 'lastVerify' | 'setup' | 'status'>>,
): LoopRunStatus {
  if (result.complete) return 'done'
  if (result.status === 'waiting' || result.reviewEscalatedToHitl) return 'waiting'
  if (isEnvVerifyFailure(result.lastVerify) || isEnvVerifyFailure(result.setup)) return 'waiting'
  return 'continue'
}

export type AgentLoopPhase = 'SETUP' | 'GOAL' | 'WORKER' | 'VERIFY' | 'JUDGE'

export type AgentLoopPhaseEvent = {
  phase: AgentLoopPhase
  iteration: number
  maxIterations: number
  /** Cumulative budget cost so far (USD). */
  costUsd: number
  listCostUsd?: number
  billedCostUsd?: number
}

export type AgentLoopOptions = {
  ctx: RepoContext
  bundle: LoadedLoopBundle
  verbose?: boolean
  /** Optional per-batch fan-out rubric injected into worker prompts. */
  batchRubric?: string
  onIterationStart?: (iteration: number) => void
  /** Phase-transition hook for live progress (CLI watch / structured phase lines). */
  onPhase?: (event: AgentLoopPhaseEvent) => void
  /** Injected worker session from the host (WorkerPort). When set, bypasses createLoopAgentSession. */
  workerSession?: LoopAgentSession
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
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
  const skillsSection = loadLoopSkillSection(repoRoot, skillPaths, config.skillDisclosure)
  if (skillsSection) {
    const how =
      config.skillDisclosure === SKILL_DISCLOSURE_INLINE ? 'inlined' : 'indexed (Read on demand)'
    console.error(`[agent-loop] ${how} ${skillPaths.length} skill runbook(s) into iteration prompts`)
  }
  const researchRelative = resolveLoopResearchRelativePath(
    bundle.loopDir,
    repoRoot,
    config.research,
  )
  const researchSection = researchRelative
    ? loadLoopResearchSection(repoRoot, researchRelative)
    : undefined
  if (researchRelative) {
    console.error(`[agent-loop] indexed research map ${researchRelative}`)
  }
  let agentSession: LoopAgentSession | undefined = options.workerSession
  const baseAgent = resolveLoopAgent(config)
  const reviewAgent = resolveReviewAgent(config)

  console.error(
    `[agent-loop] repo=${repoRoot} runtime=${loopRuntimeLabel(baseAgent.runtime)} ` +
      `worker=${baseAgent.model} review=${loopRuntimeLabel(reviewAgent.runtime)}/${reviewAgent.model} verify mode=${config.verifyMode}`,
  )
  for (const line of unpricedModelWarnings([
    baseAgent.model,
    config.escalateModel,
    reviewAgent.model,
  ])) {
    console.error(line)
  }

  const priorFailures: VerifyResult[] = []
  let lastVerify: VerifyResult | null = null
  let setupResult: VerifyResult | undefined
  let frozenSnapshot: FrozenFileSnapshot[] = []
  let iterations = 0
  let workerFaults = 0
  let reviewBlockers: string[] | undefined
  let guidePackets: GuidePacket[] | undefined
  let reviewCyclesUsed = 0
  let reviewAdvisoryBlockers = false
  let usageSummary = emptyUsageSummary()
  const transcriptEvents: TranscriptEvent[] = []
  const stagnationThreshold = config.stagnationThreshold

  const emitPhase = (phase: AgentLoopPhase, iteration: number): void => {
    if (phase === 'WORKER' || phase === 'JUDGE') {
      resetAssistantStream(bundle.loopDir)
    }
    options.onPhase?.({
      phase,
      iteration,
      maxIterations: config.maxIterations,
      costUsd: usageSummary.totalCostUsd,
      listCostUsd: usageSummary.totalListCostUsd,
      billedCostUsd: usageSummary.totalBilledCostUsd,
    })
  }

  const finish = (
    result: Omit<AgentLoopResult, 'usage' | 'status'> & {
      usage?: LoopUsageSummary
      status?: LoopRunStatus
    },
  ): AgentLoopResult => {
    const usage = result.usage ?? usageSummary
    logUsageSummary('agent-loop', usage)
    const status = result.status ?? deriveLoopRunStatus(result)
    const finalResult: AgentLoopResult = {
      ...result,
      usage,
      status,
      ...(setupResult && !result.setup ? { setup: setupResult } : {}),
    }
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
    if (config.exportPack) {
      writeLoopExportPack({
        repoRoot,
        loopDir: bundle.loopDir,
        result: finalResult,
      })
    }
    return finalResult
  }

  const parkOnBudget = async (
    iteration: number,
    reason: string,
  ): Promise<AgentLoopResult> => {
    console.error(`[agent-loop] ${reason}`)
    const hitlCheckTaskUuid = await createHitlCheckpoint({
      description: reason,
      reason: 'budget',
      ctx,
      loopDir: bundle.loopDir,
      loopOverrides: hitlLoopOverridesFrom(config),
    })
    return finish({
      complete: false,
      iterations: iteration,
      completionReason: reason,
      lastVerify,
      logPath,
      status: 'waiting',
      ...(hitlCheckTaskUuid ? { hitlCheckTaskUuid } : {}),
    })
  }

  /** Stop the loop (waiting) when cumulative cost crosses the dollar cap. */
  const stopOnBudget = async (iteration: number): Promise<AgentLoopResult | undefined> => {
    if (config.maxCostUsd === undefined || !budgetCrossed(config, usageSummary)) return undefined
    return parkOnBudget(iteration, budgetCompletionReason(config.maxCostUsd, usageSummary))
  }

  /**
   * Worker-only. A green verify must not become `waiting` because the residual
   * judge would not fit — `stopOnBudget` after review still parks if the invoice
   * crossed the cap (GOAL: after implement, and after review if billed).
   */
  const refuseIfNextWorkerExceedsBudget = async (
    model: string,
    promptChars: number,
    startedIteration: number,
  ): Promise<AgentLoopResult | undefined> => {
    const reason = nextWorkerBudgetRefusal(config, usageSummary, model, promptChars)
    if (!reason) return undefined
    return parkOnBudget(Math.max(0, startedIteration - 1), reason)
  }

  const parkOnEnv = async (
    iteration: number,
    verify: VerifyResult,
    reason: 'verify_env' | 'setup',
    completionReason: string,
  ): Promise<AgentLoopResult> => {
    console.error(`[agent-loop] ${completionReason}`)
    logFailureDomainFromVerify(bundle.loopDir, {
      iteration,
      reason,
      verify,
      status: 'waiting',
    })
    const hitlCheckTaskUuid = await createHitlCheckpoint({
      description: completionReason,
      reason,
      ctx,
      loopDir: bundle.loopDir,
      loopOverrides: hitlLoopOverridesFrom(config),
    })
    return finish({
      complete: false,
      iterations: iteration,
      completionReason,
      lastVerify: reason === 'setup' ? lastVerify : verify,
      logPath,
      status: 'waiting',
      ...(reason === 'setup' ? { setup: verify } : {}),
      ...(hitlCheckTaskUuid ? { hitlCheckTaskUuid } : {}),
    })
  }

  const uninstallAssistantStream = installLoopAssistantStream(bundle.loopDir)
  try {
    emitPhase('GOAL', 1)

    const researchAbs = researchRelative ? path.join(repoRoot, researchRelative) : undefined
    const frozenExtras = researchAbs ? [researchAbs] : []
    frozenSnapshot = snapshotFrozenFiles(bundle.loopDir, repoRoot, frozenExtras)

    const setupCommand = resolveLoopSetupCommand(bundle.loopDir, repoRoot, config.setup)
    if (setupCommand) {
      emitPhase('SETUP', 1)
      console.error(`[agent-loop] setup: ${setupCommand}`)
      setupResult = runLoopSetup(setupCommand, repoRoot, bundle.loopDir)
      if (!setupResult.complete) {
        const rolledBack = restoreFrozenFiles(frozenSnapshot)
        if (rolledBack.restored.length > 0) {
          console.error(
            `[agent-loop] frozen files restored after setup failure: ${rolledBack.restored.join(', ')}`,
          )
        }
        return await parkOnEnv(
          0,
          setupResult,
          'setup',
          `Setup failed (exit ${setupResult.exitCode ?? 'null'}). Fix the toolchain or lockfile install, then re-run. ${setupResult.reason}`,
        )
      }
      console.error(`[agent-loop] setup passed — ${setupResult.reason}`)
      frozenSnapshot = snapshotFrozenFiles(bundle.loopDir, repoRoot, frozenExtras)
    }

    const session = agentSession ?? (await createLoopAgentSession(config, ctx))
    agentSession = session

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
        workerFaults > 0,
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
        researchSection,
        batchRubric: options.batchRubric,
        mode: config.mode,
        failureContext,
      })

      console.error(
        `[agent-loop] iteration ${i}/${config.maxIterations} — ${iterationAgent.runtime} ${iterationAgent.model} (fresh context)`,
      )
      const budgetRefuse = await refuseIfNextWorkerExceedsBudget(
        iterationAgent.model,
        prompt.length,
        i,
      )
      if (budgetRefuse) return budgetRefuse
      emitPhase('WORKER', i)
      const collector = config.exportTranscript
        ? new StreamCollector({ phase: 'implement', iteration: i })
        : undefined
      const workerStartedAt = Date.now()
      let assistantRun: AgentRunResult
      try {
        assistantRun = await runIterationWithRetry(
          session,
          prompt,
          iterationAgent,
          {
            verbose,
            assistantOutput: 'none',
            collector,
          },
        )
      } catch (err) {
        const escalate = shouldEscalateAfterWorkerFault(err, config, iterationAgent, i)
        const message = formatErrorChain(err)
        const workerFaultVerify = workerSdkVerifyResult(
          message,
          escalate ? config.escalateModel : undefined,
        )
        lastVerify = workerFaultVerify
        priorFailures.push(workerFaultVerify)
        appendJsonlLine(
          logPath,
          buildIterationLog({
            iteration: i,
            git,
            verify: workerFaultVerify,
            assistantText: '',
            model: iterationAgent.model,
            reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
            durationsMs: { worker: elapsedMs(workerStartedAt) },
          }),
        )
        if (!escalate) throw err
        console.error(
          `[agent-loop] worker fault during iteration ${i} — switching to ${config.escalateModel} next: ${message}`,
        )
        logFailureDomainFromAgentError(bundle.loopDir, { iteration: i, message })
        workerFaults += 1
        await recycleWorkerSession(session)
        await maybePauseAfterIteration(config, i)
        continue
      }
      usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
      const budgetStop = await stopOnBudget(i)
      if (budgetStop) return budgetStop
      const assistantText = assistantRun.text
      const innerAgent = assistantRun.innerAgent
      if (assistantRun.transcriptEvents?.length) {
        transcriptEvents.push(...assistantRun.transcriptEvents)
      }
      const workerLogFields = {
        workerSession: assistantRun.sessionRef,
        toolSummary: assistantRun.toolSummary,
      }
      const workerMs = elapsedMs(workerStartedAt)

      if (innerAgent && !innerAgent.complete) {
        console.error(
          `[agent-loop] warn: ${innerAgent.reason ?? 'inner agent incomplete'} (outer verifier may still pass)`,
        )
      }

      if (config.delayMs > 0) {
        await sleep(config.delayMs)
      }

      const frozenAfterWorker = restoreFrozenFiles(frozenSnapshot)
      emitPhase('VERIFY', i)
      const verifyStartedAt = Date.now()
      let verify: VerifyResult
      let finalVerify: VerifyResult | undefined
      if (frozenAfterWorker.restored.length > 0) {
        console.error(
          `[agent-loop] frozen files restored after worker: ${frozenAfterWorker.restored.join(', ')}`,
        )
        verify = frozenFilesVerifyResult(frozenAfterWorker.restored)
      } else {
        console.error(`[agent-loop] iteration ${i} — verify: ${config.verify}`)
        verify = attachVerifyClass(
          config.verifyMode === 'skill'
            ? await runVerifySkill({
                ctx,
                loopDir: bundle.loopDir,
                goal,
                config,
                verbose,
                agent: iterationAgent,
                iteration: i,
                escalationRepeatCount: stagnation.escalationRepeatCount,
                reviewCycleEscalation: reviewCyclesUsed,
              })
            : runVerifyCommand(config.verify, repoRoot),
        )
        if (verify.complete && config.finalVerify) {
          console.error(`[agent-loop] inner verify passed — final: ${config.finalVerify}`)
          finalVerify = attachVerifyClass(runVerifyCommand(config.finalVerify, repoRoot))
        }
        const frozenAfterVerify = restoreFrozenFiles(frozenSnapshot)
        if (frozenAfterVerify.restored.length > 0) {
          console.error(
            `[agent-loop] frozen files restored after verify: ${frozenAfterVerify.restored.join(', ')}`,
          )
          verify = frozenFilesVerifyResult(frozenAfterVerify.restored)
          finalVerify = undefined
        }
      }
      const iterationVerify = finalVerify ?? verify
      lastVerify = iterationVerify
      const verifyMs = elapsedMs(verifyStartedAt)

      const passed = iterationVerify.complete
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
      let judgeMs: number | undefined

      // Every iteration-log call site below shares these fields; only `review` varies.
      const appendCurrentIterationLog = (review?: LoopIterationLog['review']): void => {
        appendJsonlLine(
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
            sdkRetries: assistantRun.sdkRetries,
            durationsMs: {
              worker: workerMs,
              verify: verifyMs,
              ...(judgeMs != null ? { judge: judgeMs } : {}),
            },
            ...workerLogFields,
          }),
        )
      }

      if (isEnvVerifyFailure(iterationVerify)) {
        appendCurrentIterationLog()
        return await parkOnEnv(
          i,
          iterationVerify,
          'verify_env',
          `Verifier environment limitation (exit ${iterationVerify.exitCode ?? 'null'}). Fix the toolchain or deps, then re-run. ${iterationVerify.reason}`,
        )
      }

      if (passed) {
        emitPhase('JUDGE', i)
        const judgeStartedAt = Date.now()
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
        judgeMs = elapsedMs(judgeStartedAt)
        usageSummary = reviewPhase.usageSummary
        reviewLog = reviewPhase.reviewLog

        const reviewBudgetStop = await stopOnBudget(i)
        if (reviewBudgetStop) return reviewBudgetStop

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
          completionReason: iterationVerify.reason,
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
      priorFailures.push(iterationVerify)
      console.error(`[agent-loop] iteration ${i} failed — ${iterationVerify.reason}`)

      await maybePauseAfterIteration(config, i)

      const afterFailure = detectStagnation(priorFailures, stagnationThreshold)
      if (afterFailure.stagnant) {
        console.error(
          `[agent-loop] stagnation: same verifier failure ${afterFailure.repeatCount} times — stopping early`,
        )
        logFailureDomainFromVerify(bundle.loopDir, {
          iteration: i,
          reason: 'stagnation',
          verify: iterationVerify,
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
    const message = formatErrorChain(err)
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
    uninstallAssistantStream()
    await agentSession?.dispose()
  }
}

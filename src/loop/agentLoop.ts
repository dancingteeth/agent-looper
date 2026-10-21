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
import {
  buildStallProbePromptSection,
  createGitWorkspacePort,
  pickStallProbeWinner,
  wrapProbeRestoreError,
  type StallProbeVariant,
  type WorkspacePort,
} from './loopStallProbes.js'
import {
  AGENT_SDK_VERIFY_COMMAND,
  appendFailureDomain,
  logFailureDomainFromVerify,
  logFailureDomainFromAgentError,
} from './loopFailureDomain.js'
import { readFailureContext } from './loopFailureContext.js'
import { readLessons, recordGreenRunLessons } from './loopLessons.js'
import { buildDeliverableNudgeSection, missingDeliverables } from './loopDeliverables.js'
import { detectPlainTextToolCalls } from './loopToolCallText.js'
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
  mergeToolErrorStatRows,
  summarizeSessionToolErrors,
  type ToolErrorStatRow,
} from './loopToolErrors.js'
import {
  recycleWorkerSession,
  runIterationWithRetry,
  shouldEscalateAfterWorkerFault,
  sleep,
  workerSdkVerifyResult,
} from './loopWorkerRetry.js'
import { appendWorkerAgentFailureContext } from './loopWorkerFailureContext.js'
import {
  classifyWorkerAgentError,
  extractPartialWorkerRun,
  TRANSIENT_AGENT_ITERATION_BACKOFF_MS,
} from './loopWorkerAgentError.js'
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

/** CLI exit when the loop completed successfully (verify + optional review). */
export const LOOP_EXIT_SUCCESS = 0
/** CLI exit for harness/bootstrap fatals (uncaught throw, missing bundle). */
export const LOOP_EXIT_FATAL = 1
/**
 * CLI exit when the loop ended without success (verify/review miss or park).
 * Exit `2` does not distinguish `status: continue` from `status: waiting` — read
 * `status` / `complete` on the result or `AGENT_LOOP_DONE` payload.
 */
export const LOOP_EXIT_INCOMPLETE = 2
/** Alias of {@link LOOP_EXIT_INCOMPLETE} for parked runs (`status: waiting`). */
export const LOOP_EXIT_PARKED = LOOP_EXIT_INCOMPLETE

export type LoopCliExitCode =
  | typeof LOOP_EXIT_SUCCESS
  | typeof LOOP_EXIT_FATAL
  | typeof LOOP_EXIT_INCOMPLETE
  | typeof LOOP_EXIT_PARKED

/** Map loop result → process exit code for agent-loop / AGENT_LOOP_DONE. */
export function resolveLoopCliExitCode(
  result: Pick<AgentLoopResult, 'complete' | 'status'>,
): LoopCliExitCode {
  if (result.complete) return LOOP_EXIT_SUCCESS
  if (result.status === 'waiting') return LOOP_EXIT_PARKED
  return LOOP_EXIT_INCOMPLETE
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
  /** Workspace snapshot/restore for stall probes (tests inject a fake; default is git). */
  workspacePort?: WorkspacePort<any>
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
  const lessonsForPrompt = config.lessons ? readLessons(bundle.loopDir) : undefined
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
  let previousWorkerPlainTextToolCalls = false
  let stallProbesUsed = false
  const workspacePort = options.workspacePort ?? createGitWorkspacePort(repoRoot)

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

    let consecutiveTransientAgentErrors = 0

    iterationLoop: for (let i = 1; i <= config.maxIterations; i++) {
      iterations = i
      options.onIterationStart?.(i)

      const repeatCount = detectStagnation(priorFailures, stagnationThreshold).repeatCount
      const stagnation = resolveStagnationPolicy(config, repeatCount, stallProbesUsed)
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
        lessons: lessonsForPrompt,
        verifyCommand: config.verify,
        deliverables: config.deliverables,
        plainTextToolCallWarning: previousWorkerPlainTextToolCalls,
      })

      console.error(
        `[agent-loop] iteration ${i}/${config.maxIterations} — ${iterationAgent.runtime} ${iterationAgent.model} (fresh context)`,
      )

      /**
       * Single owner for a worker fault — primary call, deliverable nudge, or stall probe.
       * Fatal → log the iteration and rethrow (the run ends). Recoverable → log, count the
       * transient, recycle the session; returns a park/budget result to return, or
       * `undefined` when the caller should move on to the next outer iteration.
       */
      const handleWorkerFault = async (
        err: unknown,
        workerStartedAt: number,
        label: string,
      ): Promise<AgentLoopResult | undefined> => {
        const escalate = shouldEscalateAfterWorkerFault(err, config, iterationAgent, i)
        const message = formatErrorChain(err)
        const partialRun = extractPartialWorkerRun(err)
        const isFatalWorker = classifyWorkerAgentError(err) === 'fatal'
        if (!isFatalWorker && partialRun?.usage) {
          usageSummary = addUsageRecord(usageSummary, partialRun.usage)
        }
        if (isFatalWorker) {
          const workerFaultVerify = workerSdkVerifyResult(message)
          const faultToolErrors = summarizeSessionToolErrors({
            role: 'worker',
            runtime: config.runtime,
            model: iterationAgent.model,
            agentErrorMessage: message,
            transcriptEvents: partialRun?.transcriptEvents,
          })
          appendJsonlLine(
            logPath,
            buildIterationLog({
              iteration: i,
              git,
              verify: workerFaultVerify,
              assistantText: partialRun?.text ?? '',
              model: iterationAgent.model,
              reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
              usage: partialRun?.usage,
              durationsMs: { worker: elapsedMs(workerStartedAt) },
              ...(faultToolErrors ? { toolErrorStats: [faultToolErrors] } : {}),
            }),
          )
          throw err
        }

        const workerFaultVerify = workerSdkVerifyResult(
          message,
          escalate ? config.escalateModel : undefined,
          true,
        )
        lastVerify = workerFaultVerify
        priorFailures.push(workerFaultVerify)
        const faultToolErrors = summarizeSessionToolErrors({
          role: 'worker',
          runtime: config.runtime,
          model: iterationAgent.model,
          agentErrorMessage: message,
          transcriptEvents: partialRun?.transcriptEvents,
        })
        appendJsonlLine(
          logPath,
          buildIterationLog({
            iteration: i,
            git,
            verify: workerFaultVerify,
            assistantText: partialRun?.text ?? '',
            model: iterationAgent.model,
            reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
            usage: partialRun?.usage,
            durationsMs: { worker: elapsedMs(workerStartedAt) },
            ...(faultToolErrors ? { toolErrorStats: [faultToolErrors] } : {}),
          }),
        )
        appendWorkerAgentFailureContext(bundle.loopDir, {
          iteration: i,
          message,
          verify: workerFaultVerify,
        })
        logFailureDomainFromAgentError(bundle.loopDir, { iteration: i, message })
        consecutiveTransientAgentErrors += 1
        if (consecutiveTransientAgentErrors >= config.maxConsecutiveTransientAgentErrors) {
          appendFailureDomain(bundle.loopDir, {
            iteration: i,
            reason: 'agent_transient_exhausted',
            fingerprint: `agent_transient_exhausted|${consecutiveTransientAgentErrors}`,
            verify: {
              command: AGENT_SDK_VERIFY_COMMAND,
              exitCode: null,
              reason: message.slice(0, 500),
            },
            status: 'waiting',
            repeatCount: consecutiveTransientAgentErrors,
          })
          return finish({
            complete: false,
            iterations: i,
            completionReason: `Worker agent: ${consecutiveTransientAgentErrors} consecutive transient error(s) (cap ${config.maxConsecutiveTransientAgentErrors}). Last: ${message}`,
            lastVerify,
            logPath,
            status: 'waiting',
          })
        }
        if (escalate) {
          console.error(
            `[agent-loop] worker fault during ${label} — switching to ${config.escalateModel} next: ${message}`,
          )
          workerFaults += 1
        } else {
          console.error(
            `[agent-loop] transient worker agent error during ${label} — continuing after backoff: ${message}`,
          )
        }
        const budgetStopAfterFault = await stopOnBudget(i)
        if (budgetStopAfterFault) return budgetStopAfterFault
        if (i < config.maxIterations) {
          await recycleWorkerSession(session)
          await sleep(TRANSIENT_AGENT_ITERATION_BACKOFF_MS)
        }
        await maybePauseAfterIteration(config, i)
        return undefined
      }

      const runProbeWorkerVerify = async (
        workerPrompt: string,
      ): Promise<
        | {
            assistantText: string
            iterationVerify: VerifyResult
            workerMs: number
            verifyMs: number
            assistantRun: AgentRunResult
            plainTextToolCalls: boolean
          }
        | AgentLoopResult
      > => {
        const budgetRefuse = await refuseIfNextWorkerExceedsBudget(
          iterationAgent.model,
          workerPrompt.length,
          i,
        )
        if (budgetRefuse) return budgetRefuse
        emitPhase('WORKER', i)
        const collector = config.exportTranscript
          ? new StreamCollector({ phase: 'implement', iteration: i })
          : undefined
        const workerStartedAt = Date.now()
        let assistantRun = await runIterationWithRetry(session, workerPrompt, iterationAgent, {
          verbose,
          assistantOutput: 'none',
          collector,
        })
        usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
        if (assistantRun.transcriptEvents?.length) {
          transcriptEvents.push(...assistantRun.transcriptEvents)
        }
        let plainTextToolCalls = detectPlainTextToolCalls(assistantRun.text)
        // Same deliverable guard as the normal worker path; a fault here throws to the
        // probe's catch (restore + shared fault path).
        const probeDeliverables = config.deliverables ?? []
        for (
          let nudge = 0;
          probeDeliverables.length > 0 && nudge < config.deliverableNudges;
          nudge++
        ) {
          const missing = missingDeliverables(repoRoot, probeDeliverables)
          if (missing.length === 0) break
          const nudgePrompt = `${workerPrompt}\n\n${buildDeliverableNudgeSection(missing)}`
          const nudgeRefuse = await refuseIfNextWorkerExceedsBudget(
            iterationAgent.model,
            nudgePrompt.length,
            i,
          )
          if (nudgeRefuse) return nudgeRefuse
          assistantRun = await runIterationWithRetry(session, nudgePrompt, iterationAgent, {
            verbose,
            assistantOutput: 'none',
            collector,
          })
          usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
          if (assistantRun.transcriptEvents?.length) {
            transcriptEvents.push(...assistantRun.transcriptEvents)
          }
          plainTextToolCalls ||= detectPlainTextToolCalls(assistantRun.text)
        }
        const assistantText = assistantRun.text
        const workerMs = elapsedMs(workerStartedAt)
        if (config.delayMs > 0) {
          await sleep(config.delayMs)
        }
        const frozenAfterWorker = restoreFrozenFiles(frozenSnapshot)
        emitPhase('VERIFY', i)
        const verifyStartedAt = Date.now()
        let verify: VerifyResult
        if (frozenAfterWorker.restored.length > 0) {
          verify = frozenFilesVerifyResult(frozenAfterWorker.restored)
        } else {
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
          const frozenAfterVerify = restoreFrozenFiles(frozenSnapshot)
          if (frozenAfterVerify.restored.length > 0) {
            verify = frozenFilesVerifyResult(frozenAfterVerify.restored)
          }
        }
        const iterationVerify = verify
        const verifyMs = elapsedMs(verifyStartedAt)
        return { assistantText, iterationVerify, workerMs, verifyMs, assistantRun, plainTextToolCalls }
      }

      let assistantText: string
      let assistantRun: AgentRunResult
      let iterationVerify: VerifyResult
      let workerMs: number
      let verifyMs: number
      let finalVerify: VerifyResult | undefined
      let verify: VerifyResult
      let innerAgent: AgentRunResult['innerAgent']
      let workerLogFields: {
        workerSession?: AgentRunResult['sessionRef']
        toolSummary?: AgentRunResult['toolSummary']
        toolErrorStats?: ToolErrorStatRow[]
      }
      let probeLogsWritten = false
      /** Kept green probe: its iteration line is written by the success path (with review). */
      let deferredProbeLog: LoopIterationLog['probe'] | undefined

      let probeRound = stagnation.probeRepeatCount !== undefined
      let s0: unknown
      if (probeRound) {
        try {
          s0 = await workspacePort.snapshot()
        } catch (err) {
          // e.g. unmerged index entries: never guess at the workspace — skip probes for
          // this run and carry on with the normal worker.
          console.error(
            `[agent-loop] stall probes skipped: workspace snapshot failed: ${formatErrorChain(err)}`,
          )
          stallProbesUsed = true
          probeRound = false
        }
      }

      if (probeRound) {
        probeLogsWritten = true
        stallProbesUsed = true
        const stalled = lastVerify ?? priorFailures[priorFailures.length - 1]
        if (!stalled) {
          throw new Error('stall probe round requires a prior verifier failure')
        }
        const probeInput = {
          verifyCommand: config.verify,
          lastVerify,
          diffStat: git.diffStat,
        }
        type ProbeRun = Awaited<ReturnType<typeof runProbeWorkerVerify>>
        const probeRuns: Array<{
          variant: StallProbeVariant
          run: Exclude<ProbeRun, AgentLoopResult>
        }> = []

        const writeProbeLines = (
          winner: StallProbeVariant | undefined,
          skip?: StallProbeVariant,
        ): void => {
          for (const probe of probeRuns) {
            if (probe.variant === skip) continue
            const { verifyForLog, verifyLog } = persistVerifyResultsForLog(
              bundle.loopDir,
              i,
              probe.run.iterationVerify,
              undefined,
              config.verifyLogMode,
            )
            appendJsonlLine(
              logPath,
              buildIterationLog({
                iteration: i,
                git,
                verify: verifyForLog,
                verifyLog,
                assistantText: probe.run.assistantText,
                usage: probe.run.assistantRun.usage,
                model: iterationAgent.model,
                reasoningEffort: iterationAgent.reasoningEffort ?? 'default',
                durationsMs: { worker: probe.run.workerMs, verify: probe.run.verifyMs },
                probe: { variant: probe.variant, kept: probe.variant === winner },
              }),
            )
          }
        }

        /**
         * Restore the workspace to a probe-round snapshot. A failed restore leaves the
         * workspace in an unknown state, so the run parks (`status: waiting`, working tree
         * left as-is for a human) — keeping the original probe/worker error alongside it.
         */
        const restoreProbeWorkspace = async (
          snap: unknown,
          phase: string,
          originalError?: unknown,
        ): Promise<AgentLoopResult | undefined> => {
          try {
            await workspacePort.restore(snap)
            return undefined
          } catch (restoreError) {
            const wrapped = wrapProbeRestoreError(phase, restoreError, originalError)
            const message = formatErrorChain(wrapped)
            console.error(`[agent-loop] ${message}`)
            appendFailureDomain(bundle.loopDir, {
              iteration: i,
              reason: 'stall_probe_restore_failed',
              fingerprint: `stall_probe_restore_failed|${phase}`,
              verify: {
                command: config.verify,
                exitCode: null,
                reason: message.slice(0, 500),
              },
              status: 'waiting',
            })
            return finish({
              complete: false,
              iterations: i,
              completionReason: message,
              lastVerify,
              logPath,
              status: 'waiting',
            })
          }
        }

        const procPrompt = `${prompt}\n\n${buildStallProbePromptSection('procedure', probeInput)}`
        const procStartedAt = Date.now()
        let procOutcome: ProbeRun
        try {
          procOutcome = await runProbeWorkerVerify(procPrompt)
        } catch (err) {
          // Roll back the half-done procedure probe; the one probe round is spent.
          const parked = await restoreProbeWorkspace(s0, 'after procedure probe fault', err)
          if (parked) return parked
          const faultResult = await handleWorkerFault(
            err,
            procStartedAt,
            `stall probe (procedure) of iteration ${i}`,
          )
          if (faultResult) return faultResult
          continue iterationLoop
        }
        consecutiveTransientAgentErrors = 0
        if ('completionReason' in procOutcome) return procOutcome
        probeRuns.push({ variant: 'procedure', run: procOutcome })

        let winner: StallProbeVariant | undefined
        if (procOutcome.iterationVerify.complete) {
          winner = 'procedure'
        } else {
          const sA = await workspacePort.snapshot()
          const parkedBeforeFacts = await restoreProbeWorkspace(s0, 'before facts probe')
          if (parkedBeforeFacts) return parkedBeforeFacts
          const factsPrompt = `${prompt}\n\n${buildStallProbePromptSection('facts', probeInput)}`
          const factsStartedAt = Date.now()
          let factsOutcome: ProbeRun
          try {
            factsOutcome = await runProbeWorkerVerify(factsPrompt)
          } catch (err) {
            // Keep the completed procedure attempt rather than a half-done facts probe.
            const parked = await restoreProbeWorkspace(sA, 'after facts probe fault', err)
            if (parked) return parked
            writeProbeLines('procedure')
            const faultResult = await handleWorkerFault(
              err,
              factsStartedAt,
              `stall probe (facts) of iteration ${i}`,
            )
            if (faultResult) return faultResult
            continue iterationLoop
          }
          consecutiveTransientAgentErrors = 0
          if ('completionReason' in factsOutcome) return factsOutcome
          probeRuns.push({ variant: 'facts', run: factsOutcome })
          const outcomes = probeRuns.map((p) => ({
            variant: p.variant,
            verify: p.run.iterationVerify,
          }))
          winner = pickStallProbeWinner(stalled, outcomes)
          const restoreTo =
            winner === 'procedure' ? sA : winner === undefined ? s0 : undefined
          if (restoreTo !== undefined) {
            const parked = await restoreProbeWorkspace(
              restoreTo,
              winner === 'procedure' ? 'keeping procedure probe' : 'no probe kept',
            )
            if (parked) return parked
          }
        }

        const keptRun =
          winner === undefined
            ? probeRuns[probeRuns.length - 1]!.run
            : probeRuns.find((p) => p.variant === winner)!.run
        assistantText = keptRun.assistantText
        assistantRun = keptRun.assistantRun
        iterationVerify = keptRun.iterationVerify
        workerMs = keptRun.workerMs
        verifyMs = keptRun.verifyMs
        verify = iterationVerify
        finalVerify = undefined
        if (iterationVerify.complete && config.finalVerify) {
          console.error(`[agent-loop] inner verify passed — final: ${config.finalVerify}`)
          finalVerify = attachVerifyClass(runVerifyCommand(config.finalVerify, repoRoot))
          const frozenAfterFinalVerify = restoreFrozenFiles(frozenSnapshot)
          if (frozenAfterFinalVerify.restored.length > 0) {
            console.error(
              `[agent-loop] frozen files restored after final verify: ${frozenAfterFinalVerify.restored.join(', ')}`,
            )
            verify = frozenFilesVerifyResult(frozenAfterFinalVerify.restored)
            finalVerify = undefined
          }
        }
        iterationVerify = finalVerify ?? verify
        if (iterationVerify.complete && winner !== undefined) {
          deferredProbeLog = { variant: winner, kept: true }
          writeProbeLines(winner, winner)
        } else {
          writeProbeLines(winner)
        }
        innerAgent = assistantRun.innerAgent
        workerLogFields = {
          workerSession: assistantRun.sessionRef,
          toolSummary: assistantRun.toolSummary,
        }
        previousWorkerPlainTextToolCalls = keptRun.plainTextToolCalls
        const probeBudgetStop = await stopOnBudget(i)
        if (probeBudgetStop) return probeBudgetStop
      } else {
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
        const faultResult = await handleWorkerFault(err, workerStartedAt, `iteration ${i}`)
        if (faultResult) return faultResult
        continue
      }
      consecutiveTransientAgentErrors = 0
      usageSummary = addUsageRecord(usageSummary, assistantRun.usage)

      const deliverables = config.deliverables ?? []
      let workerPrompt = prompt
      let nudgeCount = 0
      // Every worker call this iteration (primary + nudges): transcripts, tool-error
      // stats and the plain-text tool-call warning look at all of them, not only the last.
      const workerRuns: AgentRunResult[] = [assistantRun]
      while (deliverables.length > 0 && nudgeCount < config.deliverableNudges) {
        const missing = missingDeliverables(repoRoot, deliverables)
        if (missing.length === 0) break
        workerPrompt = `${prompt}\n\n${buildDeliverableNudgeSection(missing)}`
        console.error(
          `[agent-loop] deliverables missing (${missing.join(', ')}) — nudge ${nudgeCount + 1}/${config.deliverableNudges}`,
        )
        const nudgeBudgetRefuse = await refuseIfNextWorkerExceedsBudget(
          iterationAgent.model,
          workerPrompt.length,
          i,
        )
        if (nudgeBudgetRefuse) return nudgeBudgetRefuse
        const nudgeStartedAt = Date.now()
        try {
          assistantRun = await runIterationWithRetry(
            session,
            workerPrompt,
            iterationAgent,
            {
              verbose,
              assistantOutput: 'none',
              collector,
            },
          )
        } catch (err) {
          // Same path as the primary worker: the attempt counts, the session is
          // recycled, and the run moves to the next outer iteration (escalation,
          // maxIterations, the transient cap and the budget all apply).
          const faultResult = await handleWorkerFault(
            err,
            nudgeStartedAt,
            `deliverable nudge ${nudgeCount + 1} of iteration ${i}`,
          )
          if (faultResult) return faultResult
          continue iterationLoop
        }
        usageSummary = addUsageRecord(usageSummary, assistantRun.usage)
        workerRuns.push(assistantRun)
        nudgeCount += 1
        const nudgeBudgetStop = await stopOnBudget(i)
        if (nudgeBudgetStop) return nudgeBudgetStop
      }

      const budgetStop = await stopOnBudget(i)
      if (budgetStop) return budgetStop
      assistantText = assistantRun.text
      previousWorkerPlainTextToolCalls = workerRuns.some((run) =>
        detectPlainTextToolCalls(run.text),
      )
      innerAgent = assistantRun.innerAgent
      const iterationWorkerEvents = workerRuns.flatMap((run) => run.transcriptEvents ?? [])
      if (iterationWorkerEvents.length) {
        transcriptEvents.push(...iterationWorkerEvents)
      }
      const workerToolErrors = summarizeSessionToolErrors({
        role: 'worker',
        runtime: config.runtime,
        model: iterationAgent.model,
        transcriptEvents: iterationWorkerEvents,
      })
      workerLogFields = {
        workerSession: assistantRun.sessionRef,
        toolSummary: assistantRun.toolSummary,
        ...(workerToolErrors ? { toolErrorStats: [workerToolErrors] } : {}),
      }
      // Measured after the nudge loop, so durationsMs.worker covers every nudge call too.
      workerMs = elapsedMs(workerStartedAt)

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
      iterationVerify = finalVerify ?? verify
      verifyMs = elapsedMs(verifyStartedAt)
      }

      lastVerify = iterationVerify
      const passed = iterationVerify.complete
      const siblingRepos = siblingReposForIterationLog(config)
      const persistedVerify = probeLogsWritten
        ? {
            verifyForLog: iterationVerify,
            verifyLog: undefined,
            finalVerifyForLog: undefined,
          }
        : persistVerifyResultsForLog(
            bundle.loopDir,
            i,
            verify,
            finalVerify,
            config.verifyLogMode,
          )
      const { verifyForLog, verifyLog, finalVerifyForLog } = persistedVerify

      if (passed) {
        runPostVerifierExtensionHooks(config, repoRoot)
      }

      let reviewLog: LoopIterationLog['review'] | undefined
      let judgeMs: number | undefined
      let reviewPhaseToolErrors: ToolErrorStatRow[] | undefined

      // Every iteration-log call site below shares these fields; only `review` varies.
      const appendCurrentIterationLog = (review?: LoopIterationLog['review']): void => {
        // Probe rounds already logged one line per probe; only a kept green probe is
        // written here (once, with its review) so a green iteration has a single record.
        if (probeLogsWritten && !deferredProbeLog) return
        const toolErrorStats = mergeToolErrorStatRows([
          ...(workerLogFields.toolErrorStats ?? []),
          ...(reviewPhaseToolErrors ?? []),
        ])
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
            ...(toolErrorStats.length > 0 ? { toolErrorStats } : {}),
            ...(deferredProbeLog ? { probe: deferredProbeLog } : {}),
          }),
        )
        deferredProbeLog = undefined
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
        reviewPhaseToolErrors = reviewPhase.toolErrorStats

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
              reviewJudgeErrorClass: reviewPhase.outcome.reviewJudgeErrorClass,
            })
          }
          return finish({
            complete: false,
            iterations: i,
            completionReason: reviewPhase.outcome.completionReason,
            lastVerify,
            logPath,
            ...(reviewPhase.outcome.parkWaiting ? { status: 'waiting' } : {}),
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
        if (config.lessons) {
          recordGreenRunLessons(bundle.loopDir, {
            verifyCommand: config.verify,
            iterations: i,
            failuresOvercome: priorFailures,
          })
        }
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
      const skipStagnationStopForProbeRound =
        config.stallProbes && probeLogsWritten && stallProbesUsed
      if (afterFailure.stagnant && !skipStagnationStopForProbeRound) {
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
    const partialRun = extractPartialWorkerRun(err)
    if (partialRun?.usage) {
      usageSummary = addUsageRecord(usageSummary, partialRun.usage)
    }
    console.error(`[agent-loop] fatal agent SDK error during iteration ${iterations}: ${message}`)
    logFailureDomainFromAgentError(bundle.loopDir, { iteration: iterations, message })
    return finish({
      complete: false,
      iterations,
      completionReason: `Agent SDK error (fatal) during iteration ${iterations}: ${message}`,
      lastVerify,
      logPath,
    })
  } finally {
    uninstallAssistantStream()
    await agentSession?.dispose()
  }
}

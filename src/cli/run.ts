#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  formatRepoProfileCheck,
  validateRepoProfile,
} from '../context/repoProfileDoctor.js'
import { runAgentLoop } from '../loop/agentLoop.js'
import type { LoopRuntime } from '../loop/loopAgentConfig.js'
import { loadLoopBundle, mergeLoopConfig, resolveLoopDir } from '../loop/loopConfig.js'
import { detectLoopRuntimes } from './detectRuntimes.js'
import { formatUsageSummaryLine } from '../usage/loopUsage.js'
import { maybeCreateIncompleteLoopHitl } from '../integrations/loopFailureVisibility.js'
import {
  emitLoopCompletionSignal,
  runReportSignalPath,
  shouldEmitLoopCompletionSignal,
} from '../integrations/loopCompletionSignal.js'
import { postLoopCompletionChannels } from '../integrations/loopCompletionChannels.js'
import {
  preflightTelegramNotify,
  sendLoopTelegramReport,
  sendLoopTelegramReviewAttachment,
  shouldPreflightTelegram,
} from '../integrations/telegramNotify.js'
import { formatLoopCompletionReport } from '../loop/loopReport.js'
import { formatLoopResumeCommand } from '../loop/loopResumeCommand.js'
import { assertShellConfigTrusted } from '../loop/loopShellTrust.js'
import { assertLoopCredentials } from '../loop/loopCredentialPreflight.js'
import { WatchHeartbeat, clearWatchStatus, watchStatusPath, writeWatchStatus } from '../loop/loopWatch.js'
import { trackLooperRunFinished, trackLooperRunStarted } from '../telemetry/looperTelemetry.js'
import { parseRunArgs, type RunCliOptions } from './runArgs.js'
import { runWatchCommand } from './watch.js'

const rawArgv = process.argv.slice(2)
if (rawArgv[0] === 'watch') {
  process.exit(await runWatchCommand(rawArgv.slice(1)))
}

const parsedArgs = parseRunArgs(rawArgv)
if (parsedArgs.kind === 'help') {
  console.log(parsedArgs.text)
  process.exit(0)
}
if (parsedArgs.kind === 'error') {
  console.error(parsedArgs.message)
  process.exit(1)
}
const cli: RunCliOptions = parsedArgs.options
const ctx = resolveRepoContext({ repoRoot: cli.repoRoot })
const loopDir = resolveLoopDir(cli.loopDir, ctx.repoRoot)
const bundleLabel = path.relative(ctx.repoRoot, loopDir)
let loadedNotifyTelegram = cli.notifyTelegram ?? false
let loadedHitlOnFailure = false
let loadedHitlTaskwarriorProject: string | undefined
let loadedHitlProvider = ctx.profile.hitlProvider
let loadedHitlFileDir = ctx.profile.hitlFileDir
let loadedHitlCommand = ctx.profile.hitlCommand
let loadedHitlLinearTeam = ctx.profile.hitlLinearTeam
let loadedNotifyCommand = ctx.profile.notifyCommand
let loadedNotifyPrComment: boolean | undefined
let emitCompletionSignal = shouldEmitLoopCompletionSignal({
  completionSignal: cli.noCompletionSignal ? false : true,
})
let telemetryRuntime: LoopRuntime | undefined
let telemetryReviewGate = false
let runStartedAt: number | undefined
let lastCheckPassed: boolean | undefined

async function finishLoopExit(input: {
  exitCode: 0 | 1 | 2
  complete: boolean
  reason: string
  iterations?: number
  hitl?: string
  includeRunReport?: boolean
  report?: string
}): Promise<never> {
  if (telemetryRuntime && runStartedAt !== undefined) {
    trackLooperRunFinished({
      runtime: telemetryRuntime,
      reviewGate: telemetryReviewGate,
      durationMs: Date.now() - runStartedAt,
      checkPassed: lastCheckPassed,
    })
  }
  const runReport = runReportSignalPath({
    loopDir,
    repoRoot: ctx.repoRoot,
    include: Boolean(input.includeRunReport),
  })
  // Wake local agents before slow webhook/notifyCommand/PR comment.
  if (emitCompletionSignal) {
    emitLoopCompletionSignal({
      v: 1,
      kind: 'loop',
      bundle: bundleLabel,
      complete: input.complete,
      exitCode: input.exitCode,
      reason: input.reason,
      iterations: input.iterations,
      hitl: input.hitl,
      runReport,
    })
  }
  await postLoopCompletionChannels({
    repoRoot: ctx.repoRoot,
    profile: ctx.profile,
    kind: 'loop',
    bundleLabel,
    loopDir,
    complete: input.complete,
    exitCode: input.exitCode,
    reason: input.reason,
    report: input.report,
    iterations: input.iterations,
    hitl: input.hitl,
    runReport,
    notifyCommand: loadedNotifyCommand,
    notifyPrComment: loadedNotifyPrComment,
    noNotifyCommand: cli.noNotifyCommand,
  })
  process.exit(input.exitCode)
}

async function reportFatalVisibility(err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  try {
    await maybeCreateIncompleteLoopHitl({
      ctx,
      loopDir,
      bundleLabel,
      result: {
        complete: false,
        completionReason: `CLI aborted before loop finished: ${message}`,
      },
      telegramReportSent: false,
      config: {
        notifyTelegram: loadedNotifyTelegram,
        hitlOnFailure: loadedHitlOnFailure,
        taskwarriorProject: loadedHitlTaskwarriorProject,
        hitlProvider: loadedHitlProvider,
        hitlFileDir: loadedHitlFileDir,
        hitlCommand: loadedHitlCommand,
        hitlLinearTeam: loadedHitlLinearTeam,
      },
    })
  } catch (hitlErr) {
    console.error('[agent-loop] HITL on fatal failed:', hitlErr)
  }
}

try {
  const detection = await detectLoopRuntimes()
  let bundle = loadLoopBundle(loopDir, { detection })
  bundle = {
    ...bundle,
    config: mergeLoopConfig(bundle.config, {
      maxIterations: cli.maxIterations,
      maxCostUsd: cli.maxCostUsd,
      verify: cli.verify,
      finalVerify: cli.finalVerify,
      postQualityReview:
        cli.qualityReview === true ? true : cli.qualityReview === 'off' ? false : undefined,
      reviewGate: cli.reviewGate,
      syncOnSuccess: cli.skipSync ? false : undefined,
      runtime: cli.runtime,
      model: cli.model,
      reviewRuntime: cli.reviewRuntime,
      reviewModel: cli.reviewModel,
      reviewSecondaryRuntime: cli.reviewSecondaryRuntime,
      reviewSecondaryModel: cli.reviewSecondaryModel,
      escalateModel: cli.escalateModel,
      mode: cli.mode,
      pauseAfterIteration: cli.pauseAfterIteration,
      notifyTelegram: cli.notifyTelegram,
      trustConfig: cli.trustConfig,
      requireNotify: cli.requireNotify ? true : undefined,
      completionSignal: cli.noCompletionSignal ? false : undefined,
    }),
  }
  loadedNotifyTelegram = bundle.config.notifyTelegram
  loadedHitlOnFailure = Boolean(bundle.config.hitlOnFailure)
  loadedHitlTaskwarriorProject = bundle.config.taskwarriorProject
  loadedHitlProvider = bundle.config.hitlProvider ?? ctx.profile.hitlProvider
  loadedHitlFileDir = bundle.config.hitlFileDir ?? ctx.profile.hitlFileDir
  loadedHitlCommand = bundle.config.hitlCommand ?? ctx.profile.hitlCommand
  loadedHitlLinearTeam = bundle.config.hitlLinearTeam ?? ctx.profile.hitlLinearTeam
  loadedNotifyCommand = bundle.config.notifyCommand ?? ctx.profile.notifyCommand
  loadedNotifyPrComment = bundle.config.notifyPrComment
  emitCompletionSignal = shouldEmitLoopCompletionSignal({
    completionSignal: bundle.config.completionSignal,
  })

  console.error(`[agent-loop] repo=${ctx.repoRoot}`)
  console.error(`[agent-loop] bundle=${path.relative(ctx.repoRoot, loopDir)}`)
  console.error(`[agent-loop] verify=${bundle.config.verify}`)
  if (bundle.config.finalVerify) {
    console.error(`[agent-loop] finalVerify=${bundle.config.finalVerify}`)
  }
  if (bundle.config.reviewGate) {
    console.error(
      `[agent-loop] reviewGate=true maxReviewCycles=${bundle.config.maxReviewCycles}`,
    )
  }
  console.error(
    `[agent-loop] runtime=${bundle.config.runtime} model=${bundle.config.model ?? '(default)'}`,
  )
  if (bundle.config.reviewSecondaryRuntime) {
    console.error(
      `[agent-loop] reviewSecondaryRuntime=${bundle.config.reviewSecondaryRuntime} ` +
        `reviewSecondaryModel=${bundle.config.reviewSecondaryModel ?? '(default)'}`,
    )
  }
  console.error(`[agent-loop] maxIterations=${bundle.config.maxIterations}`)
  if (bundle.config.mode !== 'forward') {
    console.error(`[agent-loop] mode=${bundle.config.mode}`)
  }
  if (bundle.config.pauseAfterIteration) {
    console.error('[agent-loop] pauseAfterIteration=true')
  }
  console.error(`[agent-loop] log=${path.relative(ctx.repoRoot, bundle.logPath)}`)

  assertLoopCredentials(bundle.config)
  console.error(
    `[agent-loop] credentials ok worker=${bundle.config.runtime} judge=${bundle.config.reviewRuntime ?? 'cursor'}`,
  )

  const profileCheck = validateRepoProfile(ctx, { detection })
  if (!profileCheck.ok) {
    console.error('[agent-loop] repo profile errors:')
    console.error(formatRepoProfileCheck({ ...profileCheck, warnings: [] }))
    throw new Error('repo profile validation failed')
  }
  for (const warning of profileCheck.warnings) {
    console.error(`[agent-loop] warn: ${warning}`)
  }

  if (bundle.config.taskwarriorUuid && bundle.config.syncOnSuccess === false && !cli.skipSync) {
    console.error(
      '[agent-loop] warn: taskwarriorUuid is set but syncOnSuccess=false — TW task will not be marked done automatically',
    )
  }

  assertShellConfigTrusted({
    cwd: ctx.repoRoot,
    verify: bundle.config.verify,
    finalVerify: bundle.config.finalVerify,
    syncCommand: ctx.profile.syncCommand,
    hitlCommand: bundle.config.hitlCommand ?? ctx.profile.hitlCommand,
    notifyCommand: cli.noNotifyCommand
      ? null
      : (bundle.config.notifyCommand ?? ctx.profile.notifyCommand),
    skipSync: cli.skipSync,
    trustConfig: cli.trustConfig || bundle.config.trustConfig,
    requireTrustConfig: cli.requireTrustConfig,
  })

  if (
    shouldPreflightTelegram({
      profile: ctx.profile,
      notifyTelegram: bundle.config.notifyTelegram,
    })
  ) {
    const preflight = await preflightTelegramNotify(ctx.profile)
    if (!preflight.ok) {
      const msg = `[agent-loop] telegram preflight failed: ${preflight.detail}`
      if (bundle.config.requireNotify || cli.requireNotify) {
        console.error(msg)
        console.error('[agent-loop] aborting (--require-notify / requireNotify)')
        throw new Error(`telegram preflight failed: ${preflight.detail}`)
      }
      console.error(`${msg} — continuing (set requireNotify or --require-notify to abort)`)
    } else if (preflight.botUsername) {
      console.error(`[agent-loop] telegram preflight ok (@${preflight.botUsername})`)
    } else {
      console.error('[agent-loop] telegram preflight ok')
    }
  }

  telemetryRuntime = bundle.config.runtime
  telemetryReviewGate = Boolean(bundle.config.reviewGate)
  runStartedAt = Date.now()
  trackLooperRunStarted({
    runtime: bundle.config.runtime,
    reviewGate: telemetryReviewGate,
  })

  const heartbeat = new WatchHeartbeat({ emit: (line) => console.error(line) })
  try {
    const result = await runAgentLoop({
      ctx,
      bundle,
      verbose: cli.verbose,
      onPhase: (event) => {
        heartbeat.update({
          phase: event.phase,
          iteration: event.iteration,
          maxIterations: event.maxIterations,
          costUsd: event.costUsd,
        })
        try {
          writeWatchStatus(watchStatusPath(loopDir), {
            phase: event.phase,
            iteration: event.iteration,
            maxIterations: event.maxIterations,
            costUsd: event.costUsd,
            phaseStartedAt: new Date().toISOString(),
            pid: process.pid,
          })
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          console.error(`[agent-loop] watch-status write failed: ${detail}`)
        }
      },
    })

    console.error(`[agent-loop] finished complete=${result.complete} iterations=${result.iterations}`)
    console.error(`[agent-loop] reason: ${result.completionReason}`)
    if (result.reviewAdvisoryBlockers) {
      console.error('[agent-loop] advisory review had BLOCKERS (reviewGate=false)')
    }
    if (result.innerAgentIncomplete) {
      console.error('[agent-loop] inner agent did not complete cleanly (see log innerAgent)')
    }
    if (!result.complete) {
      console.error(`[agent-loop] → resume: ${formatLoopResumeCommand(bundleLabel)}`)
    }
    if (result.hitlCheckTaskUuid) {
      console.error(`[agent-loop] HITL: uuid:${result.hitlCheckTaskUuid}`)
    }
    console.error(`[agent-loop] ${formatUsageSummaryLine(result.usage)}`)

    const telegramReport = formatLoopCompletionReport({
      repoRoot: ctx.repoRoot,
      bundleLabel,
      loopDir,
      result,
    })
    const telegramReportSent = await sendLoopTelegramReport({
      profile: ctx.profile,
      notifyTelegram: bundle.config.notifyTelegram,
      complete: result.complete,
      report: telegramReport,
    })

    await sendLoopTelegramReviewAttachment({
      profile: ctx.profile,
      notifyTelegram: bundle.config.notifyTelegram,
      telegramAttachReview: bundle.config.telegramAttachReview,
      complete: result.complete,
      loopDir,
      bundleLabel,
    })

    const hitlId =
      (await maybeCreateIncompleteLoopHitl({
        ctx,
        loopDir,
        bundleLabel,
        result,
        telegramReportSent,
        config: {
          notifyTelegram: bundle.config.notifyTelegram,
          hitlOnFailure: bundle.config.hitlOnFailure,
          taskwarriorProject: bundle.config.taskwarriorProject,
          hitlProvider: bundle.config.hitlProvider,
          hitlFileDir: bundle.config.hitlFileDir,
          hitlCommand: bundle.config.hitlCommand,
          hitlLinearTeam: bundle.config.hitlLinearTeam,
        },
      })) ?? result.hitlCheckTaskUuid

    lastCheckPassed = result.lastVerify?.complete

    const exitCode: 0 | 2 = result.complete ? 0 : 2
    await finishLoopExit({
      exitCode,
      complete: result.complete,
      reason: result.completionReason,
      iterations: result.iterations,
      hitl: hitlId,
      includeRunReport: bundle.config.exportRunReport,
      report: telegramReport,
    })
  } finally {
    heartbeat.stop()
    clearWatchStatus(watchStatusPath(loopDir))
  }
} catch (err) {
  console.error('[agent-loop] failed:', err)
  await reportFatalVisibility(err)
  const message = err instanceof Error ? err.message : String(err)
  await finishLoopExit({
    exitCode: 1,
    complete: false,
    reason: message,
  })
}

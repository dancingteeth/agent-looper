#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  formatRepoProfileCheck,
  validateRepoProfile,
} from '../context/repoProfileDoctor.js'
import { runAgentLoop } from '../loop/agentLoop.js'
import { loadLoopBundle, mergeLoopConfig, resolveLoopDir } from '../loop/loopConfig.js'
import { formatUsageSummaryLine } from '../usage/loopUsage.js'
import { maybeCreateIncompleteLoopHitl } from '../integrations/loopFailureVisibility.js'
import {
  exitWithLoopCompletionSignal,
  runReportSignalPath,
  shouldEmitLoopCompletionSignal,
} from '../integrations/loopCompletionSignal.js'
import {
  resolveNotifyCommand,
  runLoopNotifyCommand,
} from '../integrations/loopNotifyCommand.js'
import {
  preflightTelegramNotify,
  sendLoopTelegramReport,
  sendLoopTelegramReviewAttachment,
  shouldPreflightTelegram,
} from '../integrations/telegramNotify.js'
import { formatLoopCompletionReport } from '../loop/loopReport.js'
import { assertShellConfigTrusted } from '../loop/loopShellTrust.js'
import { parseRunArgs, type RunCliOptions } from './runArgs.js'

const parsedArgs = parseRunArgs(process.argv.slice(2))
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
let emitCompletionSignal = shouldEmitLoopCompletionSignal({
  completionSignal: cli.noCompletionSignal ? false : true,
})

function finishLoopExit(input: {
  exitCode: 0 | 1 | 2
  complete: boolean
  reason: string
  iterations?: number
  hitl?: string
  includeRunReport?: boolean
  report?: string
}): never {
  const runReport = runReportSignalPath({
    loopDir,
    repoRoot: ctx.repoRoot,
    include: Boolean(input.includeRunReport),
  })
  const notifyCommand = resolveNotifyCommand({
    profileCommand: ctx.profile.notifyCommand,
    loopCommand: loadedNotifyCommand,
    disabled: cli.noNotifyCommand,
  })
  if (notifyCommand) {
    runLoopNotifyCommand({
      repoRoot: ctx.repoRoot,
      command: notifyCommand,
      kind: 'loop',
      bundle: bundleLabel,
      complete: input.complete,
      exitCode: input.exitCode,
      reason: input.reason,
      report: input.report,
      iterations: input.iterations,
      hitl: input.hitl,
      runReport,
    })
  }
  exitWithLoopCompletionSignal({
    emit: emitCompletionSignal,
    exitCode: input.exitCode,
    payload: {
      v: 1,
      kind: 'loop',
      bundle: bundleLabel,
      complete: input.complete,
      exitCode: input.exitCode,
      reason: input.reason,
      iterations: input.iterations,
      hitl: input.hitl,
      runReport,
    },
  })
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
  let bundle = loadLoopBundle(loopDir)
  bundle = {
    ...bundle,
    config: mergeLoopConfig(bundle.config, {
      maxIterations: cli.maxIterations,
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
  console.error(`[agent-loop] maxIterations=${bundle.config.maxIterations}`)
  if (bundle.config.mode !== 'forward') {
    console.error(`[agent-loop] mode=${bundle.config.mode}`)
  }
  if (bundle.config.pauseAfterIteration) {
    console.error('[agent-loop] pauseAfterIteration=true')
  }
  console.error(`[agent-loop] log=${path.relative(ctx.repoRoot, bundle.logPath)}`)

  const profileCheck = validateRepoProfile(ctx)
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

  const result = await runAgentLoop({ ctx, bundle, verbose: cli.verbose })

  console.error(`[agent-loop] finished complete=${result.complete} iterations=${result.iterations}`)
  console.error(`[agent-loop] reason: ${result.completionReason}`)
  if (result.reviewAdvisoryBlockers) {
    console.error('[agent-loop] advisory review had BLOCKERS (reviewGate=false)')
  }
  if (result.innerAgentIncomplete) {
    console.error('[agent-loop] inner agent did not complete cleanly (see log innerAgent)')
  }
  if (result.hitlCheckTaskUuid) {
    console.error(`[agent-loop] HITL manual check: task uuid:${result.hitlCheckTaskUuid}`)
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

  const exitCode: 0 | 2 = result.complete ? 0 : 2
  finishLoopExit({
    exitCode,
    complete: result.complete,
    reason: result.completionReason,
    iterations: result.iterations,
    hitl: hitlId,
    includeRunReport: bundle.config.exportRunReport,
    report: telegramReport,
  })
} catch (err) {
  console.error('[agent-loop] failed:', err)
  await reportFatalVisibility(err)
  const message = err instanceof Error ? err.message : String(err)
  finishLoopExit({
    exitCode: 1,
    complete: false,
    reason: message,
  })
}

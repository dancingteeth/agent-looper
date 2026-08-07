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
import { sendLoopTelegramReport, sendLoopTelegramReviewAttachment } from '../integrations/telegramNotify.js'
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
  }),
}

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
  process.exit(1)
}
for (const warning of profileCheck.warnings) {
  console.error(`[agent-loop] warn: ${warning}`)
}

if (bundle.config.taskwarriorUuid && bundle.config.syncOnSuccess === false && !cli.skipSync) {
  console.error(
    '[agent-loop] warn: taskwarriorUuid is set but syncOnSuccess=false — TW task will not be marked done automatically',
  )
}

try {
  assertShellConfigTrusted({
    cwd: ctx.repoRoot,
    verify: bundle.config.verify,
    finalVerify: bundle.config.finalVerify,
    syncCommand: ctx.profile.syncCommand,
    skipSync: cli.skipSync,
    trustConfig: cli.trustConfig || bundle.config.trustConfig,
    requireTrustConfig: cli.requireTrustConfig,
  })

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

  await sendLoopTelegramReport({
    profile: ctx.profile,
    notifyTelegram: bundle.config.notifyTelegram,
    complete: result.complete,
    report: formatLoopCompletionReport({
      repoRoot: ctx.repoRoot,
      bundleLabel: path.relative(ctx.repoRoot, loopDir),
      loopDir,
      result,
    }),
  })

  await sendLoopTelegramReviewAttachment({
    profile: ctx.profile,
    notifyTelegram: bundle.config.notifyTelegram,
    telegramAttachReview: bundle.config.telegramAttachReview,
    complete: result.complete,
    loopDir,
    bundleLabel: path.relative(ctx.repoRoot, loopDir),
  })

  if (!result.complete) {
    process.exit(2)
  }
} catch (err) {
  console.error('[agent-loop] failed:', err)
  process.exit(1)
}

#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  runLoopBatch,
  resolveBatchDir,
  loadLoopBatchConfig,
  resolveBatchLoopDir,
  normalizeBatchLoopEntry,
} from '../loop/loopBatch.js'
import { formatUsageSummaryLine } from '../usage/loopUsage.js'
import { maybeCreateIncompleteLoopHitl } from '../integrations/loopFailureVisibility.js'
import {
  preflightTelegramNotify,
  sendLoopTelegramReport,
  sendLoopTelegramReviewAttachment,
  shouldPreflightTelegram,
} from '../integrations/telegramNotify.js'
import { formatBatchCompletionReport } from '../loop/loopReport.js'
import { assertShellConfigTrusted } from '../loop/loopShellTrust.js'
import { parseRunBatchArgs, type RunBatchCliOptions } from './runBatchArgs.js'
import { loadLoopBundle } from '../loop/loopConfig.js'

const parsedArgs = parseRunBatchArgs(process.argv.slice(2))
if (parsedArgs.kind === 'help') {
  console.log(parsedArgs.text)
  process.exit(0)
}
if (parsedArgs.kind === 'error') {
  console.error(parsedArgs.message)
  process.exit(1)
}
const cli: RunBatchCliOptions = parsedArgs.options
const ctx = resolveRepoContext({ repoRoot: cli.repoRoot })
const batchDir = resolveBatchDir(cli.batchDir, ctx.repoRoot)
const batchConfig = loadLoopBatchConfig(batchDir)
const batchLabel = path.relative(ctx.repoRoot, batchDir)

console.error(`[agent-loop-batch] repo=${ctx.repoRoot}`)
console.error(`[agent-loop-batch] batch=${path.relative(ctx.repoRoot, batchDir)}`)

const loops = batchConfig.loops ?? []
const batchTrusted =
  cli.trustConfig ||
  (loops.length > 0 &&
    loops.every((loopEntry) => {
      try {
        const { path: loopRel } = normalizeBatchLoopEntry(loopEntry)
        const loopDir = resolveBatchLoopDir(loopRel, batchDir, ctx.repoRoot)
        return loadLoopBundle(loopDir).config.trustConfig
      } catch {
        return false
      }
    }))

const notifyTelegram =
  cli.notifyTelegram === false ? false : batchConfig.notifyTelegram

async function reportFatalVisibility(err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  try {
    await maybeCreateIncompleteLoopHitl({
      ctx,
      loopDir: batchDir,
      bundleLabel: batchLabel,
      result: {
        complete: false,
        completionReason: `Batch CLI aborted before finish: ${message}`,
      },
      telegramReportSent: false,
      config: {
        notifyTelegram,
        hitlOnFailure: Boolean(batchConfig.hitlOnFailure),
        taskwarriorProject: batchConfig.taskwarriorProject,
        hitlProvider: batchConfig.hitlProvider ?? ctx.profile.hitlProvider,
        hitlFileDir: batchConfig.hitlFileDir ?? ctx.profile.hitlFileDir,
        hitlCommand: batchConfig.hitlCommand ?? ctx.profile.hitlCommand,
        hitlLinearTeam: batchConfig.hitlLinearTeam ?? ctx.profile.hitlLinearTeam,
      },
    })
  } catch (hitlErr) {
    console.error('[agent-loop-batch] HITL on fatal failed:', hitlErr)
  }
}

try {
  assertShellConfigTrusted({
    cwd: ctx.repoRoot,
    syncCommand: ctx.profile.syncCommand,
    hitlCommand: batchConfig.hitlCommand ?? ctx.profile.hitlCommand,
    skipSync: cli.skipSync,
    trustConfig: batchTrusted,
    requireTrustConfig: cli.requireTrustConfig,
  })

  if (shouldPreflightTelegram({ profile: ctx.profile, notifyTelegram })) {
    const preflight = await preflightTelegramNotify(ctx.profile)
    if (!preflight.ok) {
      const msg = `[agent-loop-batch] telegram preflight failed: ${preflight.detail}`
      if (batchConfig.requireNotify || cli.requireNotify) {
        console.error(msg)
        console.error('[agent-loop-batch] aborting (--require-notify / requireNotify)')
        throw new Error(`telegram preflight failed: ${preflight.detail}`)
      }
      console.error(`${msg} — continuing (set requireNotify or --require-notify to abort)`)
    } else if (preflight.botUsername) {
      console.error(`[agent-loop-batch] telegram preflight ok (@${preflight.botUsername})`)
    } else {
      console.error('[agent-loop-batch] telegram preflight ok')
    }
  }

  const result = await runLoopBatch({
    ctx,
    batchDir: cli.batchDir,
    verbose: cli.verbose,
    skipSync: cli.skipSync,
    onLoopStart: (loopDir, index, total) => {
      console.error(
        `[agent-loop-batch] loop ${index}/${total}: ${path.relative(ctx.repoRoot, loopDir)}`,
      )
    },
  })

  console.error(
    `[agent-loop-batch] finished complete=${result.complete} loopsRun=${result.loopsRun}`,
  )
  console.error(`[agent-loop-batch] reason: ${result.completionReason}`)
  console.error(`[agent-loop-batch] ${formatUsageSummaryLine(result.usage)}`)

  const telegramReportSent = await sendLoopTelegramReport({
    profile: ctx.profile,
    notifyTelegram,
    complete: result.complete,
    report: formatBatchCompletionReport({
      repoRoot: ctx.repoRoot,
      batchLabel,
      result,
    }),
  })

  for (const entry of result.iterations) {
    await sendLoopTelegramReviewAttachment({
      profile: ctx.profile,
      notifyTelegram,
      telegramAttachReview: batchConfig.telegramAttachReview,
      complete: entry.result.complete,
      loopDir: entry.loopDir,
      bundleLabel: path.relative(ctx.repoRoot, entry.loopDir),
    })
  }

  await maybeCreateIncompleteLoopHitl({
    ctx,
    loopDir: batchDir,
    bundleLabel: batchLabel,
    result: {
      complete: result.complete,
      completionReason: result.completionReason,
    },
    telegramReportSent,
    config: {
      notifyTelegram,
      hitlOnFailure: batchConfig.hitlOnFailure,
      taskwarriorProject: batchConfig.taskwarriorProject,
      hitlProvider: batchConfig.hitlProvider,
      hitlFileDir: batchConfig.hitlFileDir,
      hitlCommand: batchConfig.hitlCommand,
      hitlLinearTeam: batchConfig.hitlLinearTeam,
    },
  })

  if (!result.complete) {
    process.exit(2)
  }
} catch (err) {
  console.error('[agent-loop-batch] failed:', err)
  await reportFatalVisibility(err)
  process.exit(1)
}

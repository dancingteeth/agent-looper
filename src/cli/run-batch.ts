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
import { sendLoopTelegramReport, sendLoopTelegramReviewAttachment } from '../integrations/telegramNotify.js'
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

try {
  assertShellConfigTrusted({
    cwd: ctx.repoRoot,
    syncCommand: ctx.profile.syncCommand,
    skipSync: cli.skipSync,
    trustConfig: batchTrusted,
    requireTrustConfig: cli.requireTrustConfig,
  })
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err))
  process.exit(1)
}

try {
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

  const notifyTelegram =
    cli.notifyTelegram === false ? false : batchConfig.notifyTelegram

  await sendLoopTelegramReport({
    profile: ctx.profile,
    notifyTelegram,
    complete: result.complete,
    report: formatBatchCompletionReport({
      repoRoot: ctx.repoRoot,
      batchLabel: path.relative(ctx.repoRoot, batchDir),
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

  if (!result.complete) {
    process.exit(2)
  }
} catch (err) {
  console.error('[agent-loop-batch] failed:', err)
  process.exit(1)
}

#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  formatRepoProfileCheck,
  validateRepoProfile,
} from '../context/repoProfileDoctor.js'
import {
  formatLoopExtensionPreflight,
  validateLoopExtensionPreflight,
} from '../loop/loopExtensions.js'
import { runAgentLoop } from '../loop/agentLoop.js'
import { loadLoopBundle, mergeLoopConfig, resolveLoopDir } from '../loop/loopConfig.js'
import { formatUsageSummaryLine } from '../usage/loopUsage.js'
import { sendLoopTelegramReport, sendLoopTelegramReviewAttachment } from '../integrations/telegramNotify.js'
import { formatLoopCompletionReport } from '../loop/loopReport.js'
import { assertShellConfigTrusted } from '../loop/loopShellTrust.js'
import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

type CliOptions = {
  loopDir: string
  repoRoot?: string
  verbose: boolean
  maxIterations?: number
  verify?: string
  finalVerify?: string
  qualityReview?: boolean | 'off'
  reviewGate?: boolean
  skipSync?: boolean
  runtime?: 'cursor' | 'cline-pass' | 'cline'
  model?: string
  reviewModel?: string
  escalateModel?: string
  mode?: 'forward' | 'reverse'
  pauseAfterIteration?: boolean
  notifyTelegram?: boolean
  trustConfig?: boolean
  requireTrustConfig?: boolean
}

function usage(): string {
  return `Usage: agent-loop run <loop-dir> [options]

  <loop-dir>   Path to a loop bundle (GOAL.md + loop.json)

Options:
  --verbose, -v                   Tool args/results on stderr
${printRepoRootHelp()}
  --max-iterations <n>            Override loop.json maxIterations
  --verify <shell-cmd>            Override loop.json verify command
  --final-verify <cmd>            Override loop.json finalVerify
  --quality-review                Force advisory post-success review
  --no-quality-review             Skip post-success review
  --review-gate                   Require review verdict != BLOCKERS to complete
  --no-review-gate                Disable review gate (default from loop.json)
  --skip-sync                     Do not run repo profile syncCommand
  --runtime <cursor|cline-pass|cline>  Override loop.json runtime (cline = usage-billing credits)
  --model <id>                    Override loop.json worker model
  --review-model <id>             Override loop.json reviewModel (Cursor judge; default grok-4.5 on cursor)
  --escalate-model <id>           Override loop.json escalateModel
  --mode <forward|reverse>        Loop mode (default from loop.json)
  --pause-after-iteration         Wait for Enter between iterations (TTY only)
  --no-telegram                   Skip Telegram completion report
  --trust-config                  Acknowledge reviewed shell commands (verify / finalVerify / sync)
  --require-trust-config          Abort unless --trust-config, loop.json trustConfig, or AGENT_LOOP_TRUST_CONFIG=1

Cursor-only hackathon tip:
  --runtime cursor --review-gate
  # worker = composer-2.5, judge = grok-4.5 (no Cline / 3rd-party)

Each iteration: fresh agent → shell verifier → append log.ndjson`
}

function parseArgs(argv: string[]): CliOptions {
  const { args: verboseStripped, verbose } = parseVerboseFlag(argv)
  const { remaining, repoRoot } = parseRepoRootFlag(verboseStripped)

  const positional: string[] = []
  let maxIterations: number | undefined
  let verify: string | undefined
  let finalVerify: string | undefined
  let qualityReview: boolean | 'off' | undefined
  let reviewGate: boolean | undefined
  let skipSync = false
  let runtime: CliOptions['runtime']
  let model: string | undefined
  let reviewModel: string | undefined
  let escalateModel: string | undefined
  let mode: CliOptions['mode']
  let pauseAfterIteration: boolean | undefined
  let notifyTelegram: boolean | undefined
  let trustConfig: boolean | undefined
  let requireTrustConfig = false

  for (let i = 0; i < remaining.length; i++) {
    const arg = remaining[i]
    if (arg === 'run') {
      continue
    }
    if (arg === '--') {
      continue
    }
    if (arg === '--max-iterations') {
      const raw = remaining[++i]
      if (raw === undefined || raw.startsWith('-')) {
        console.error('--max-iterations requires a number')
        process.exit(1)
      }
      maxIterations = Number(raw)
      if (!Number.isFinite(maxIterations) || maxIterations < 1) {
        console.error(`--max-iterations must be a positive integer (got ${raw})`)
        process.exit(1)
      }
      continue
    }
    if (arg === '--verify') {
      verify = remaining[++i]
      continue
    }
    if (arg === '--final-verify') {
      finalVerify = remaining[++i]
      continue
    }
    if (arg === '--quality-review') {
      qualityReview = true
      continue
    }
    if (arg === '--no-quality-review') {
      qualityReview = 'off'
      continue
    }
    if (arg === '--review-gate') {
      reviewGate = true
      continue
    }
    if (arg === '--no-review-gate') {
      reviewGate = false
      continue
    }
    if (arg === '--skip-sync') {
      skipSync = true
      continue
    }
    if (arg === '--runtime') {
      const value = remaining[++i]
      if (value !== 'cursor' && value !== 'cline-pass' && value !== 'cline') {
        console.error('--runtime must be cursor, cline-pass, or cline')
        process.exit(1)
      }
      runtime = value
      continue
    }
    if (arg === '--model') {
      model = remaining[++i]
      continue
    }
    if (arg === '--review-model') {
      reviewModel = remaining[++i]
      continue
    }
    if (arg === '--escalate-model') {
      escalateModel = remaining[++i]
      continue
    }
    if (arg === '--mode') {
      const value = remaining[++i]
      if (value !== 'forward' && value !== 'reverse') {
        console.error('--mode must be forward or reverse')
        process.exit(1)
      }
      mode = value
      continue
    }
    if (arg === '--pause-after-iteration') {
      pauseAfterIteration = true
      continue
    }
    if (arg === '--no-telegram') {
      notifyTelegram = false
      continue
    }
    if (arg === '--trust-config') {
      trustConfig = true
      continue
    }
    if (arg === '--require-trust-config') {
      requireTrustConfig = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    positional.push(arg)
  }

  const loopDir = positional.join(' ').trim()
  if (!loopDir) {
    console.error(usage())
    process.exit(1)
  }

  return {
    loopDir,
    repoRoot,
    verbose,
    maxIterations,
    verify,
    finalVerify,
    qualityReview,
    reviewGate,
    skipSync,
    runtime,
    model,
    reviewModel,
    escalateModel,
    mode,
    pauseAfterIteration,
    notifyTelegram,
    trustConfig,
    requireTrustConfig,
  }
}

const cli = parseArgs(process.argv.slice(2))
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

const extensionPreflight = validateLoopExtensionPreflight(ctx, bundle.config)
if (extensionPreflight.warnings.length > 0 || extensionPreflight.pendingFeatures.length > 0) {
  console.error('[agent-loop] loop extension preflight:')
  console.error(formatLoopExtensionPreflight(extensionPreflight))
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

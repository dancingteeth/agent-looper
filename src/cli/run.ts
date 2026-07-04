#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { runAgentLoop } from '../loop/agentLoop.js'
import { loadLoopBundle, mergeLoopConfig, resolveLoopDir } from '../loop/loopConfig.js'
import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

type CliOptions = {
  loopDir: string
  repoRoot?: string
  verbose: boolean
  maxIterations?: number
  verify?: string
  finalVerify?: string
  qualityReview?: boolean | 'off'
  skipSync?: boolean
  runtime?: 'cursor' | 'cline-pass'
  model?: string
  escalateModel?: string
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
  --skip-sync                     Do not run repo profile syncCommand
  --runtime <cursor|cline-pass>   Override loop.json runtime
  --model <id>                    Override loop.json model
  --escalate-model <id>           Override loop.json escalateModel

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
  let skipSync = false
  let runtime: CliOptions['runtime']
  let model: string | undefined
  let escalateModel: string | undefined

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
    if (arg === '--skip-sync') {
      skipSync = true
      continue
    }
    if (arg === '--runtime') {
      const value = remaining[++i]
      if (value !== 'cursor' && value !== 'cline-pass') {
        console.error('--runtime must be cursor or cline-pass')
        process.exit(1)
      }
      runtime = value
      continue
    }
    if (arg === '--model') {
      model = remaining[++i]
      continue
    }
    if (arg === '--escalate-model') {
      escalateModel = remaining[++i]
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
    skipSync,
    runtime,
    model,
    escalateModel,
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
    syncOnSuccess: cli.skipSync ? false : undefined,
    runtime: cli.runtime,
    model: cli.model,
    escalateModel: cli.escalateModel,
  }),
}

console.error(`[agent-loop] repo=${ctx.repoRoot}`)
console.error(`[agent-loop] bundle=${path.relative(ctx.repoRoot, loopDir)}`)
console.error(`[agent-loop] verify=${bundle.config.verify}`)
if (bundle.config.finalVerify) {
  console.error(`[agent-loop] finalVerify=${bundle.config.finalVerify}`)
}
console.error(
  `[agent-loop] runtime=${bundle.config.runtime} model=${bundle.config.model ?? '(default)'}`,
)
console.error(`[agent-loop] maxIterations=${bundle.config.maxIterations}`)
console.error(`[agent-loop] log=${path.relative(ctx.repoRoot, bundle.logPath)}`)

try {
  const result = await runAgentLoop({ ctx, bundle, verbose: cli.verbose })

  console.error(`[agent-loop] finished complete=${result.complete} iterations=${result.iterations}`)
  console.error(`[agent-loop] reason: ${result.completionReason}`)

  if (!result.complete) {
    process.exit(2)
  }
} catch (err) {
  console.error('[agent-loop] failed:', err)
  process.exit(1)
}

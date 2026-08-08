#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'
import { runMetaReview } from '../review/metaReview.js'
import { blockingBlockers } from '../review/reviewVerdict.js'
import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

function usage(): string {
  return `Usage: agent-loop-meta-review <paths…> [options]

Read-only cross-loop aggregator: collect loop artifacts → meta prompt → judge → report.
Prefers in-loop artifacts; falls back to \`.cursor/loop-exports/<slug>/\` (cloud/PR audit packs).

  <paths…>   One or more loop bundle dirs and/or a parent dir (e.g. .cursor/loops)

Options:
  --output <path>         Write report to this file (overrides --out-dir)
  --out-dir <path>        Directory for meta-review.md (default: cwd)
  --hitl                  Create HITL checkpoints from ### HITL follow-ups bullets
  --project <name>        Taskwarrior project for --hitl (default: repo profile)
  --review-runtime <id>   Judge runtime: cursor|cline-pass|cline|opencode|pi (default: cursor)
  --review-model <id>     Judge model (default depends on runtime)
  --verbose, -v
${printRepoRootHelp()}
  --help, -h              Show this help`
}

type CliOptions = {
  inputPaths: string[]
  repoRoot?: string
  verbose: boolean
  outputPath?: string
  outDir?: string
  hitl: boolean
  project?: string
  reviewRuntime?: LoopRuntime
  reviewModel?: string
}

function parseReviewRuntime(value: string): LoopRuntime {
  const allowed = [
    LOOP_RUNTIME_CURSOR,
    LOOP_RUNTIME_CLINE_PASS,
    LOOP_RUNTIME_CLINE,
    LOOP_RUNTIME_OPENCODE,
    LOOP_RUNTIME_PI,
  ] as const
  if ((allowed as readonly string[]).includes(value)) {
    return value as LoopRuntime
  }
  throw new Error(
    `--review-runtime must be one of ${allowed.join(', ')} (got ${value})`,
  )
}

function parseArgs(argv: string[]): CliOptions {
  const { args: verboseStripped, verbose } = parseVerboseFlag(argv)
  const { remaining, repoRoot } = parseRepoRootFlag(verboseStripped)

  const inputPaths: string[] = []
  let outputPath: string | undefined
  let outDir: string | undefined
  let hitl = false
  let project: string | undefined
  let reviewRuntime: LoopRuntime | undefined
  let reviewModel: string | undefined

  for (let i = 0; i < remaining.length; i++) {
    const arg = remaining[i]!
    switch (arg) {
      case '--help':
      case '-h':
        console.log(usage())
        process.exit(0)
        break
      case '--output':
        outputPath = remaining[++i]
        if (!outputPath) throw new Error('--output requires a path')
        break
      case '--out-dir':
        outDir = remaining[++i]
        if (!outDir) throw new Error('--out-dir requires a path')
        break
      case '--hitl':
        hitl = true
        break
      case '--project':
        project = remaining[++i]
        if (!project) throw new Error('--project requires a name')
        break
      case '--review-runtime': {
        const value = remaining[++i]
        if (!value) throw new Error('--review-runtime requires an id')
        reviewRuntime = parseReviewRuntime(value)
        break
      }
      case '--review-model':
        reviewModel = remaining[++i]
        if (!reviewModel) throw new Error('--review-model requires an id')
        break
      default:
        if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`)
        }
        inputPaths.push(arg)
    }
  }

  return {
    inputPaths,
    repoRoot,
    verbose,
    outputPath,
    outDir,
    hitl,
    project,
    reviewRuntime,
    reviewModel,
  }
}

const argv = process.argv.slice(2)
if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
  console.log(usage())
  process.exit(argv.length === 0 ? 1 : 0)
}

let options: CliOptions
try {
  options = parseArgs(argv)
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err))
  console.error('')
  console.error(usage())
  process.exit(1)
}

if (options.inputPaths.length === 0) {
  console.error('At least one loop path is required.')
  console.error('')
  console.error(usage())
  process.exit(1)
}

const ctx = resolveRepoContext({ repoRoot: options.repoRoot })

const result = await runMetaReview({
  inputPaths: options.inputPaths,
  ctx,
  outDir: options.outDir,
  outputPath: options.outputPath,
  hitl: options.hitl,
  taskwarriorProject: options.project,
  reviewRuntime: options.reviewRuntime,
  reviewModel: options.reviewModel,
  verbose: options.verbose,
})

console.log(`\nMeta-review written: ${path.relative(ctx.repoRoot, result.outPath)}`)
console.log(
  `\nVerdict: ${result.parsed.verdict} | Risk: ${result.parsed.risk} | Blockers: ${result.parsed.blockers.length} | Gating: ${blockingBlockers(result.parsed).length}`,
)
if (result.hitlTaskUuids.length > 0) {
  console.log(`HITL tasks: ${result.hitlTaskUuids.map((u) => `uuid:${u}`).join(', ')}`)
}

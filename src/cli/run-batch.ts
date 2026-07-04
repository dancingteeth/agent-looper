#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { runLoopBatch, resolveBatchDir } from '../loop/loopBatch.js'
import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

type CliOptions = {
  batchDir: string
  repoRoot?: string
  verbose: boolean
  skipSync: boolean
}

function usage(): string {
  return `Usage: agent-loop-batch <batch-dir> [options]

  <batch-dir>   Directory containing loop-batch.json

Options:
  --verbose, -v     Tool args/results on stderr
${printRepoRootHelp()}
  --skip-sync       Do not run repo profile syncCommand after batch`
}

function parseArgs(argv: string[]): CliOptions {
  const { args: verboseStripped, verbose } = parseVerboseFlag(argv)
  const { remaining, repoRoot } = parseRepoRootFlag(verboseStripped)

  const positional: string[] = []
  let skipSync = false

  for (const arg of remaining) {
    if (arg === '--') continue
    if (arg === '--skip-sync') {
      skipSync = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(usage())
      process.exit(0)
    }
    positional.push(arg)
  }

  const batchDir = positional.join(' ').trim()
  if (!batchDir) {
    console.error(usage())
    process.exit(1)
  }

  return { batchDir, repoRoot, verbose, skipSync }
}

const cli = parseArgs(process.argv.slice(2))
const ctx = resolveRepoContext({ repoRoot: cli.repoRoot })
const batchDir = resolveBatchDir(cli.batchDir, ctx.repoRoot)

console.error(`[agent-loop-batch] repo=${ctx.repoRoot}`)
console.error(`[agent-loop-batch] batch=${path.relative(ctx.repoRoot, batchDir)}`)

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

  if (!result.complete) {
    process.exit(2)
  }
} catch (err) {
  console.error('[agent-loop-batch] failed:', err)
  process.exit(1)
}

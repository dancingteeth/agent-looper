#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { loadLoopBundle, resolveLoopDir } from '../loop/loopConfig.js'
import { buildPostLoopQualityReviewPrompt } from '../review/loopPostReview.js'
import { inferLoopReviewRisk, resolvePostQualityReview } from '../loop/loopRisk.js'
import { parseRepoRootFlag } from './shared.js'

function usage(): void {
  console.log(`Usage: agent-loop-review-preview <loop-dir> [--prompt] [--full] [--repo-root <path>]

  Prints inferred risk and whether postQualityReview "auto" would run.`)
}

const { remaining, repoRoot } = parseRepoRootFlag(process.argv.slice(2))
const loopArg = remaining.find((a) => !a.startsWith('-'))
const showPrompt = remaining.includes('--prompt') || remaining.includes('--full')
const fullPrompt = remaining.includes('--full')

if (!loopArg || remaining.includes('--help') || remaining.includes('-h')) {
  usage()
  process.exit(loopArg ? 0 : 1)
}

const ctx = resolveRepoContext({ repoRoot })
const loopDir = resolveLoopDir(loopArg, ctx.repoRoot)
const bundle = loadLoopBundle(loopDir)
const { goal, config } = bundle

const risk = inferLoopReviewRisk(goal, config.verify)
const autoRuns = resolvePostQualityReview('auto', goal, config.verify)

console.log(`Loop:     ${path.relative(ctx.repoRoot, loopDir)}`)
console.log(`Risk:     ${risk.toUpperCase()}`)
console.log(`Config:   postQualityReview=${JSON.stringify(config.postQualityReview)}`)
console.log(`Auto:     ${autoRuns ? 'would run review.md after success' : 'would skip review'}`)

if (showPrompt) {
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const body = fullPrompt ? prompt : `${prompt.slice(0, 2500)}\n\n… (truncated; use --full)`
  console.log('\n--- review prompt preview ---\n')
  console.log(body)
}

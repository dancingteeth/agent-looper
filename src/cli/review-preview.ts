#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { loadLoopBundle, resolveLoopDir } from '../loop/loopConfig.js'
import { detectLoopRuntimes } from './detectRuntimes.js'
import { inferLoopReviewRisk, resolvePostQualityReview } from '../loop/loopRisk.js'
import { resolveLoopRiskKeywords } from '../loop/loopRiskProfile.js'
import { buildPostLoopQualityReviewPrompt } from '../review/loopPostReview.js'
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
const detection = await detectLoopRuntimes()
const bundle = loadLoopBundle(loopDir, { detection })
const { goal, config } = bundle

const riskKeywords = resolveLoopRiskKeywords({
  ctx,
  loopOverride: config.loopRiskProfile,
})
const risk = inferLoopReviewRisk(goal, config.verify, {
  profile: riskKeywords,
  reviewRisk: config.reviewRisk,
})
const autoRuns = resolvePostQualityReview('auto', goal, config.verify, {
  profile: riskKeywords,
  reviewRisk: config.reviewRisk,
})

console.log(`Loop:     ${path.relative(ctx.repoRoot, loopDir)}`)
console.log(`Risk:     ${risk.toUpperCase()}`)
console.log(`Config:   postQualityReview=${JSON.stringify(config.postQualityReview)} reviewRisk=${JSON.stringify(config.reviewRisk)}`)
console.log(`Auto:     ${autoRuns ? 'would run review.md after success' : 'would skip review'}`)

if (showPrompt) {
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const body = fullPrompt ? prompt : `${prompt.slice(0, 2500)}\n\n… (truncated; use --full)`
  console.log('\n--- review prompt preview ---\n')
  console.log(body)
}

#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { resolveReviewAgent } from '../loop/loopAgentConfig.js'
import { loopRuntimeLabel } from '../agents/agentRunner.js'
import { loadLoopBundle, resolveLoopDir } from '../loop/loopConfig.js'
import { detectLoopRuntimes } from './detectRuntimes.js'
import { runPostLoopQualityReview } from '../review/loopPostReview.js'
import { blockingBlockers } from '../review/reviewVerdict.js'
import { parseRepoRootFlag } from './shared.js'

const { remaining, repoRoot } = parseRepoRootFlag(process.argv.slice(2))
const loopArg = remaining.find((a) => !a.startsWith('-'))

if (!loopArg || remaining.includes('--help') || remaining.includes('-h')) {
  console.log(`Usage: agent-loop-review-run <loop-dir> [--repo-root <path>]

Writes <loop-dir>/review.md using repo review standards.
Uses loop.json reviewRuntime / reviewModel when set; otherwise cursor + runtime defaults.`)
  process.exit(loopArg ? 0 : 1)
}

const ctx = resolveRepoContext({ repoRoot })
const loopDir = resolveLoopDir(loopArg, ctx.repoRoot)
const detection = await detectLoopRuntimes()
const bundle = loadLoopBundle(loopDir, { detection })
const reviewAgent = resolveReviewAgent(bundle.config)

console.error(
  `[agent-loop-review-run] loop=${path.relative(ctx.repoRoot, loopDir)} judge=${loopRuntimeLabel(reviewAgent.runtime)}/${reviewAgent.model}`,
)

const text = await runPostLoopQualityReview(bundle.loopDir, bundle.goal, ctx, {
  verbose: false,
  reviewAgent,
  workerRuntime: bundle.config.runtime,
})

console.log(`\nReview written: ${path.join(path.relative(ctx.repoRoot, loopDir), path.basename(text.outPath))}`)
console.log(`\nVerdict: ${text.parsed.verdict} | Risk: ${text.parsed.risk} | Blockers: ${text.parsed.blockers.length} | Gating: ${blockingBlockers(text.parsed).length}`)
console.log(`\n--- preview (first 1200 chars) ---\n${text.text.trim().slice(0, 1200)}…`)

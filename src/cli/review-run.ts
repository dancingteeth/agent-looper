#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { loadLoopBundle, resolveLoopDir } from '../loop/loopConfig.js'
import { runPostLoopQualityReview } from '../review/loopPostReview.js'
import { parseRepoRootFlag } from './shared.js'

const { remaining, repoRoot } = parseRepoRootFlag(process.argv.slice(2))
const loopArg = remaining.find((a) => !a.startsWith('-'))

if (!loopArg || remaining.includes('--help') || remaining.includes('-h')) {
  console.log(`Usage: agent-loop-review-run <loop-dir> [--repo-root <path>]

Writes <loop-dir>/review.md using repo review standards (Cursor SDK).`)
  process.exit(loopArg ? 0 : 1)
}

const ctx = resolveRepoContext({ repoRoot })
const loopDir = resolveLoopDir(loopArg, ctx.repoRoot)
const bundle = loadLoopBundle(loopDir)

console.error(`[agent-loop-review-run] loop=${path.relative(ctx.repoRoot, loopDir)}`)

const text = await runPostLoopQualityReview(bundle.loopDir, bundle.goal, ctx, { verbose: false })

console.log(`\nReview written: ${path.join(path.relative(ctx.repoRoot, loopDir), 'review.md')}`)
console.log(`\n--- preview (first 1200 chars) ---\n${text.trim().slice(0, 1200)}…`)

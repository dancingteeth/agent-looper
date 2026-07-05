import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { RepoContext } from '../context/repoContext.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import { CURSOR_LOOP_MODEL } from '../loop/loopAgentConfig.js'
import { buildQualityReviewPrompt } from './reviewPrompt.js'
import { parseReviewMarkdown, type ParsedReview } from './reviewVerdict.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'

function gitDiffSinceBranchBase(ctx: RepoContext): string {
  const baseBranch = ctx.profile.defaultBranch
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', baseBranch], {
      cwd: ctx.repoRoot,
      encoding: 'utf8',
    }).trim()
    return execFileSync('git', ['diff', '--stat', `${base}...HEAD`], {
      cwd: ctx.repoRoot,
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
    }).trim()
  } catch {
    return execFileSync('git', ['diff', '--stat'], {
      cwd: ctx.repoRoot,
      encoding: 'utf8',
      maxBuffer: 512 * 1024,
    }).trim()
  }
}

export function buildPostLoopQualityReviewPrompt(ctx: RepoContext, goal: string): string {
  return buildQualityReviewPrompt({
    ctx,
    context: `## Loop goal\n${goal}`,
    diffStat: gitDiffSinceBranchBase(ctx),
    reviewKind: 'post-loop quality review',
  })
}

export type PostLoopReviewOptions = {
  verbose?: boolean
  /** 1-based review cycle; cycle 1 writes review.md, cycle 2+ writes review.N.md */
  reviewCycle?: number
}

export type PostLoopReviewResult = {
  text: string
  parsed: ParsedReview
  outPath: string
  usage?: LoopUsageRecord
}

export function resolveReviewOutputPath(loopDir: string, reviewCycle = 1): string {
  const filename = reviewCycle <= 1 ? 'review.md' : `review.${reviewCycle}.md`
  return path.join(loopDir, filename)
}

export async function runPostLoopQualityReview(
  loopDir: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions = {},
): Promise<PostLoopReviewResult> {
  const reviewCycle = options.reviewCycle ?? 1
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const run = await runCursorAgentPrompt(ctx, prompt, {
    verbose: options.verbose,
    assistantOutput: 'none',
    modelId: CURSOR_LOOP_MODEL,
  })
  const text = run.text
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  fs.writeFileSync(
    outPath,
    `# Post-loop quality review\n\n_Generated ${new Date().toISOString()}_\n\n${text.trim()}\n`,
    'utf8',
  )
  const parsed = parseReviewMarkdown(text)
  console.error(`[agent-loop] quality review written: ${path.relative(ctx.repoRoot, outPath)}`)
  console.error(
    `[agent-loop] quality review verdict=${parsed.verdict} risk=${parsed.risk} blockers=${parsed.blockers.length}`,
  )
  return { text, parsed, outPath, usage: run.usage }
}

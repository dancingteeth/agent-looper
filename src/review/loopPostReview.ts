import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { RepoContext } from '../context/repoContext.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import { buildQualityReviewPrompt } from './reviewPrompt.js'

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
}

export async function runPostLoopQualityReview(
  loopDir: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions = {},
): Promise<string> {
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const text = await runCursorAgentPrompt(ctx, prompt, {
    verbose: options.verbose,
    assistantOutput: 'none',
  })
  const outPath = path.join(loopDir, 'review.md')
  fs.writeFileSync(
    outPath,
    `# Post-loop quality review\n\n_Generated ${new Date().toISOString()}_\n\n${text.trim()}\n`,
    'utf8',
  )
  console.error(`[agent-loop] quality review written: ${path.relative(ctx.repoRoot, outPath)}`)
  return text
}

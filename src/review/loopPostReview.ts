import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { RepoContext } from '../context/repoContext.js'
import { defaultBranchRefExists } from '../context/defaultBranch.js'
import { runCursorAgentPrompt } from '../agents/cursorAgent.js'
import {
  CURSOR_WORKER_MODEL,
  type CursorSdkModel,
} from '../loop/loopAgentConfig.js'
import { buildQualityReviewPrompt, buildBlockerRecheckPrompt } from './reviewPrompt.js'
import { parseReviewMarkdown, type ParsedReview } from './reviewVerdict.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'

function gitDiffSinceBranchBase(ctx: RepoContext): string {
  const baseBranch = ctx.profile.defaultBranch
  if (!defaultBranchRefExists(ctx.repoRoot, baseBranch)) {
    throw new Error(
      `defaultBranch "${baseBranch}" is not a valid git ref — fix .cursor/agent-loop.repo.json or run agent-loop-init`,
    )
  }

  const base = execFileSync('git', ['merge-base', 'HEAD', baseBranch], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
  }).trim()
  return execFileSync('git', ['diff', '--stat', `${base}...HEAD`], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024,
  }).trim()
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
  /**
   * Cursor SDK judge model. Low-level default is Composer (`composer-2.5`).
   * Cursor-only loops should pass `resolveReviewModel(config)` so the judge is Grok.
   */
  reviewModel?: CursorSdkModel
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
  const reviewModel = options.reviewModel ?? CURSOR_WORKER_MODEL
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const run = await runCursorAgentPrompt(ctx, prompt, {
    verbose: options.verbose,
    assistantOutput: 'none',
    modelId: reviewModel,
    role: 'review',
    phase: 'review',
  })
  const text = run.text
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  fs.writeFileSync(
    outPath,
    `# Post-loop quality review\n\n_Model: ${reviewModel}_\n\n_Generated ${new Date().toISOString()}_\n\n${text.trim()}\n`,
    'utf8',
  )
  const parsed = parseReviewMarkdown(text)
  console.error(
    `[agent-loop] quality review written: ${path.relative(ctx.repoRoot, outPath)} (model=${reviewModel})`,
  )
  console.error(
    `[agent-loop] quality review verdict=${parsed.verdict} risk=${parsed.risk} blockers=${parsed.blockers.length}`,
  )
  return { text, parsed, outPath, usage: run.usage }
}

/**
 * Scope-limited re-check for a BLOCKERS fix round. Asks only whether the previously
 * flagged blockers are resolved, so the model cannot block completion on new,
 * possibly irrelevant findings. Parsed with the same verdict/blockers grammar.
 */
export async function runPostLoopBlockerRecheck(
  loopDir: string,
  goal: string,
  ctx: RepoContext,
  blockers: string[],
  options: PostLoopReviewOptions = {},
): Promise<PostLoopReviewResult> {
  const reviewCycle = options.reviewCycle ?? 1
  const reviewModel = options.reviewModel ?? CURSOR_WORKER_MODEL
  const prompt = buildBlockerRecheckPrompt(ctx, goal, blockers)
  const run = await runCursorAgentPrompt(ctx, prompt, {
    verbose: options.verbose,
    assistantOutput: 'none',
    modelId: reviewModel,
    role: 'review',
    phase: 'review',
  })
  const text = run.text
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  fs.writeFileSync(
    outPath,
    `# Blocker re-check\n\n_Model: ${reviewModel}_\n\n_Generated ${new Date().toISOString()}_\n\n${text.trim()}\n`,
    'utf8',
  )
  const parsed = parseReviewMarkdown(text)
  console.error(
    `[agent-loop] blocker re-check written: ${path.relative(ctx.repoRoot, outPath)} (model=${reviewModel})`,
  )
  console.error(
    `[agent-loop] blocker re-check verdict=${parsed.verdict} risk=${parsed.risk} blockers=${parsed.blockers.length}`,
  )
  return { text, parsed, outPath, usage: run.usage }
}

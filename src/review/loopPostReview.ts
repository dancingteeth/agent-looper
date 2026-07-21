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
import { parseReviewMarkdown, blockingBlockers, type ParsedReview } from './reviewVerdict.js'
import {
  applyReproduceBeforeReportFilter,
  formatReproduceFilterFooter,
} from './reviewReproduce.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'

function requireMergeBase(ctx: RepoContext): string {
  const baseBranch = ctx.profile.defaultBranch
  if (!defaultBranchRefExists(ctx.repoRoot, baseBranch)) {
    throw new Error(
      `defaultBranch "${baseBranch}" is not a valid git ref — fix .cursor/agent-loop.repo.json or run agent-loop-init`,
    )
  }
  return execFileSync('git', ['merge-base', 'HEAD', baseBranch], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
  }).trim()
}

function gitDiffSinceBranchBase(ctx: RepoContext): string {
  const base = requireMergeBase(ctx)
  return execFileSync('git', ['diff', '--stat', `${base}...HEAD`], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024,
  }).trim()
}

/** Paths changed on HEAD vs merge-base with defaultBranch (reproduce-before-report). */
export function listChangedPathsSinceBranchBase(ctx: RepoContext): string[] {
  const base = requireMergeBase(ctx)
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024,
  }).trim()
  if (!out) return []
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
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
  /**
   * When true, downgrade error+impact blockers without a citeable path in the
   * merge-base…HEAD changed-files set (roadmap M2 phase 2a).
   */
  reviewReproduce?: boolean
}

export type PostLoopReviewResult = {
  text: string
  parsed: ParsedReview
  outPath: string
  usage?: LoopUsageRecord
  /** Blockers downgraded by deterministic reproduce filter (when enabled). */
  reproduceDroppedCount?: number
}

export function resolveReviewOutputPath(loopDir: string, reviewCycle = 1): string {
  const filename = reviewCycle <= 1 ? 'review.md' : `review.${reviewCycle}.md`
  return path.join(loopDir, filename)
}

function maybeApplyReproduceFilter(
  parsed: ParsedReview,
  text: string,
  ctx: RepoContext,
  enabled: boolean,
): { parsed: ParsedReview; text: string; droppedCount: number } {
  if (!enabled) return { parsed, text, droppedCount: 0 }
  const changedPaths = listChangedPathsSinceBranchBase(ctx)
  const filtered = applyReproduceBeforeReportFilter(parsed, changedPaths)
  const footer = formatReproduceFilterFooter(filtered.dropped)
  if (filtered.dropped.length > 0) {
    console.error(
      `[agent-loop] reproduce filter: downgraded ${filtered.dropped.length} gating blocker(s) (changedPaths=${changedPaths.length})`,
    )
  }
  return {
    parsed: filtered.parsed,
    text: `${text.trim()}${footer}`,
    droppedCount: filtered.dropped.length,
  }
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
  const applied = maybeApplyReproduceFilter(
    parseReviewMarkdown(run.text),
    run.text,
    ctx,
    options.reviewReproduce === true,
  )
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  fs.writeFileSync(
    outPath,
    `# Post-loop quality review\n\n_Model: ${reviewModel}_\n\n_Generated ${new Date().toISOString()}_\n\n${applied.text.trim()}\n`,
    'utf8',
  )
  console.error(
    `[agent-loop] quality review written: ${path.relative(ctx.repoRoot, outPath)} (model=${reviewModel})`,
  )
  console.error(
    `[agent-loop] quality review verdict=${applied.parsed.verdict} risk=${applied.parsed.risk} blockers=${applied.parsed.blockers.length} gating=${blockingBlockers(applied.parsed).length}`,
  )
  return {
    text: applied.text,
    parsed: applied.parsed,
    outPath,
    usage: run.usage,
    reproduceDroppedCount: applied.droppedCount,
  }
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
  const applied = maybeApplyReproduceFilter(
    parseReviewMarkdown(run.text),
    run.text,
    ctx,
    options.reviewReproduce === true,
  )
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  fs.writeFileSync(
    outPath,
    `# Blocker re-check\n\n_Model: ${reviewModel}_\n\n_Generated ${new Date().toISOString()}_\n\n${applied.text.trim()}\n`,
    'utf8',
  )
  console.error(
    `[agent-loop] blocker re-check written: ${path.relative(ctx.repoRoot, outPath)} (model=${reviewModel})`,
  )
  console.error(
    `[agent-loop] blocker re-check verdict=${applied.parsed.verdict} risk=${applied.parsed.risk} blockers=${applied.parsed.blockers.length} gating=${blockingBlockers(applied.parsed).length}`,
  )
  return {
    text: applied.text,
    parsed: applied.parsed,
    outPath,
    usage: run.usage,
    reproduceDroppedCount: applied.droppedCount,
  }
}

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import type { RepoContext } from '../context/repoContext.js'
import { defaultBranchRefExists } from '../context/defaultBranch.js'
import { runReviewAgentPrompt } from './reviewAgentRun.js'
import {
  LOOP_RUNTIME_CURSOR,
  resolveReviewAgent,
  resolveSecondaryReviewAgent,
  type LoopRuntime,
  type ResolvedReviewAgent,
} from '../loop/loopAgentConfig.js'
import { buildQualityReviewPrompt, buildBlockerRecheckPrompt, buildReproduceCandidatesPrompt } from './reviewPrompt.js'
import {
  parseReviewMarkdown,
  blockingBlockers,
  formatBlockerLine,
  type ParsedReview,
} from './reviewVerdict.js'
import {
  applyReproduceBeforeReportFilter,
  applyAgentReproduceKeepList,
  formatReproduceFilterFooter,
  formatAgentReproduceFooter,
  formatSecondaryMergeFooter,
  mergePrimarySecondaryReviews,
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

/** Diff stat vs profile defaultBranch merge-base (shared by per-loop and meta-review). */
export function gitDiffStatSinceBranchBase(ctx: RepoContext): string {
  const base = requireMergeBase(ctx)
  return execFileSync('git', ['diff', '--stat', `${base}...HEAD`], {
    cwd: ctx.repoRoot,
    encoding: 'utf8',
    maxBuffer: 512 * 1024,
  }).trim()
}

function gitDiffNameOnly(ctx: RepoContext, args: string[]): string[] {
  const out = execFileSync('git', ['diff', '--name-only', ...args], {
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

/**
 * Paths in scope for reproduce-before-report: commits since merge-base **plus**
 * staged and unstaged working-tree changes vs that base.
 * Using only `base...HEAD` misses mid-loop uncommitted edits and can false-close the gate.
 */
export function listChangedPathsSinceBranchBase(ctx: RepoContext): string[] {
  const base = requireMergeBase(ctx)
  const paths = new Set<string>([
    ...gitDiffNameOnly(ctx, [`${base}...HEAD`]),
    // Working tree vs merge-base (committed-on-branch + unstaged dirty files).
    ...gitDiffNameOnly(ctx, [base]),
    // Staged-only vs HEAD (covers index-only edges WT comparison can miss).
    ...gitDiffNameOnly(ctx, ['--cached']),
  ])
  return [...paths]
}

export function buildPostLoopQualityReviewPrompt(ctx: RepoContext, goal: string): string {
  return buildQualityReviewPrompt({
    ctx,
    context: `## Loop goal\n${goal}`,
    diffStat: gitDiffStatSinceBranchBase(ctx),
    reviewKind: 'post-loop quality review',
  })
}

export type PostLoopReviewOptions = {
  verbose?: boolean
  /** 1-based review cycle; cycle 1 writes review.md, cycle 2+ writes review.N.md */
  reviewCycle?: number
  /** Worker runtime — used to resolve default judge model when reviewAgent is omitted. */
  workerRuntime?: LoopRuntime
  /** Primary judge runtime. Unset → cursor. */
  reviewRuntime?: LoopRuntime
  /** Judge model id for the primary review runtime. */
  reviewModel?: string
  /** Fully resolved primary judge (preferred over workerRuntime + reviewRuntime + reviewModel). */
  reviewAgent?: ResolvedReviewAgent
  /**
   * When true, downgrade error+impact blockers without a citeable path in the
   * merge-base…working-tree changed-files set (roadmap M2 phase 2a).
   * Skipped when the changed-files set is empty (fail-closed toward keeping blockers).
   */
  reviewReproduce?: boolean
  /**
   * When true (typically with reviewReproduce), run a fresh review session on remaining
   * gating blockers; DROP unevidenced candidates (roadmap M2 phase 2b).
   */
  reviewReproduceAgent?: boolean
  /** Optional second residual judge runtime. Unset = disabled. Same ids as reviewRuntime. */
  reviewSecondaryRuntime?: LoopRuntime
  /** Judge model for secondary review. Defaults per reviewSecondaryRuntime. */
  reviewSecondaryModel?: string
  /**
   * When true, residual reviewGate is on — do not skip secondary on primary PASS/ADVISORY.
   * Advisory (ungated) review still skips secondary when the primary has no gating blockers.
   */
  reviewGate?: boolean
}

export function resolvePostLoopReviewAgent(options: PostLoopReviewOptions): ResolvedReviewAgent {
  if (options.reviewAgent) {
    return options.reviewAgent
  }
  return resolveReviewAgent({
    runtime: options.workerRuntime ?? LOOP_RUNTIME_CURSOR,
    reviewRuntime: options.reviewRuntime,
    reviewModel: options.reviewModel,
  })
}

function formatReviewAgentLabel(agent: ResolvedReviewAgent): string {
  return `${agent.runtime}/${agent.model}`
}

export type PostLoopReviewResult = {
  text: string
  parsed: ParsedReview
  outPath: string
  usage?: LoopUsageRecord
  /** Blockers downgraded by deterministic reproduce filter (when enabled). */
  reproduceDroppedCount?: number
  /** Blockers dropped by the fresh reproduce agent (when enabled). */
  reproduceAgentDroppedCount?: number
  /** Gating blockers added only by the secondary judge (when enabled). */
  secondaryOnlyBlockersCount?: number
  /** Why secondary review was skipped (when configured but not run). */
  secondaryReviewSkippedReason?: string
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
  if (changedPaths.length === 0) {
    console.error(
      '[agent-loop] reproduce filter: skipped — empty changed-files set (keep gating blockers)',
    )
    return { parsed, text, droppedCount: 0 }
  }
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

async function maybeApplyReproduceAgent(
  parsed: ParsedReview,
  text: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions,
): Promise<{
  parsed: ParsedReview
  text: string
  droppedCount: number
  usage?: LoopUsageRecord
}> {
  if (options.reviewReproduceAgent !== true || options.reviewReproduce !== true) {
    return { parsed, text, droppedCount: 0 }
  }
  const gating = blockingBlockers(parsed)
  if (gating.length === 0) {
    return { parsed, text, droppedCount: 0 }
  }

  const reviewAgent = resolvePostLoopReviewAgent(options)
  const prompt = buildReproduceCandidatesPrompt(
    ctx,
    goal,
    gating.map(formatBlockerLine),
  )
  console.error(
    `[agent-loop] reproduce agent: verifying ${gating.length} gating blocker(s) (judge=${formatReviewAgentLabel(reviewAgent)})`,
  )
  const run = await runReviewAgentPrompt(ctx, prompt, reviewAgent, {
    verbose: options.verbose,
  })
  const agentParsed = parseReviewMarkdown(run.text)
  const kept = blockingBlockers(agentParsed)
  const filtered = applyAgentReproduceKeepList(parsed, kept)
  const footer = formatAgentReproduceFooter(filtered.dropped)
  if (filtered.dropped.length > 0) {
    console.error(
      `[agent-loop] reproduce agent: dropped ${filtered.dropped.length} gating blocker(s) (kept=${kept.length})`,
    )
  } else {
    console.error(`[agent-loop] reproduce agent: kept all ${gating.length} gating blocker(s)`)
  }
  return {
    parsed: filtered.parsed,
    text: `${text.trim()}${footer}`,
    droppedCount: filtered.dropped.length,
    usage: run.usage,
  }
}

function shouldSkipSecondaryReview(
  parsed: ParsedReview,
  options: PostLoopReviewOptions,
): { skip: true; reason: string } | { skip: false } {
  if (!options.reviewSecondaryRuntime) {
    return { skip: true, reason: 'disabled' }
  }
  if (options.reviewGate) {
    return { skip: false }
  }
  const gating = blockingBlockers(parsed)
  if ((parsed.verdict === 'PASS' || parsed.verdict === 'ADVISORY') && gating.length === 0) {
    return { skip: true, reason: `primary ${parsed.verdict} with no gating blockers` }
  }
  return { skip: false }
}

async function maybeRunSecondaryReview(
  parsed: ParsedReview,
  text: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions,
): Promise<{
  parsed: ParsedReview
  text: string
  secondaryOnlyCount: number
  skippedReason?: string
  secondaryModel?: string
  usage?: LoopUsageRecord
}> {
  const skip = shouldSkipSecondaryReview(parsed, options)
  if (skip.skip) {
    if (options.reviewSecondaryRuntime) {
      console.error(`[agent-loop] secondary review: skipped (${skip.reason})`)
    }
    return { parsed, text, secondaryOnlyCount: 0, skippedReason: skip.reason }
  }

  const agent = resolveSecondaryReviewAgent({
    runtime: options.workerRuntime ?? LOOP_RUNTIME_CURSOR,
    reviewSecondaryRuntime: options.reviewSecondaryRuntime,
    reviewSecondaryModel: options.reviewSecondaryModel,
  })
  if (!agent) {
    return { parsed, text, secondaryOnlyCount: 0, skippedReason: 'disabled' }
  }
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  console.error(
    `[agent-loop] secondary review: running (${agent.runtime}, model=${agent.model}, gating=${blockingBlockers(parsed).length})`,
  )
  const run = await runReviewAgentPrompt(ctx, prompt, agent, { verbose: options.verbose })
  const secondaryParsed = parseReviewMarkdown(run.text)
  const merged = mergePrimarySecondaryReviews(parsed, secondaryParsed)
  const mergeFooter = formatSecondaryMergeFooter(merged.secondaryOnly)
  const secondarySection = `\n\n### Secondary review (${agent.runtime}/${agent.model})\n${run.text.trim()}\n`
  const mergedText = `${text.trim()}${secondarySection}${mergeFooter}`
  if (merged.secondaryOnly.length > 0) {
    console.error(
      `[agent-loop] secondary review: merged ${merged.secondaryOnly.length} secondary-only gating blocker(s)`,
    )
  } else {
    console.error('[agent-loop] secondary review: no new gating blockers from secondary judge')
  }
  return {
    parsed: merged.parsed,
    text: mergedText,
    secondaryOnlyCount: merged.secondaryOnly.length,
    secondaryModel: agent.model,
    usage: run.usage,
  }
}

async function applyPostPrimaryReviewPipeline(
  primaryParsed: ParsedReview,
  primaryText: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions,
): Promise<{
  parsed: ParsedReview
  text: string
  reproduceDroppedCount: number
  reproduceAgentDroppedCount: number
  secondaryOnlyCount: number
  secondaryReviewSkippedReason?: string
  secondaryModel?: string
  usage?: LoopUsageRecord
}> {
  const filtered = maybeApplyReproduceFilter(
    primaryParsed,
    primaryText,
    ctx,
    options.reviewReproduce === true,
  )
  const agented = await maybeApplyReproduceAgent(
    filtered.parsed,
    filtered.text,
    goal,
    ctx,
    options,
  )
  const secondary = await maybeRunSecondaryReview(
    agented.parsed,
    agented.text,
    goal,
    ctx,
    options,
  )
  return {
    parsed: secondary.parsed,
    text: secondary.text,
    reproduceDroppedCount: filtered.droppedCount,
    reproduceAgentDroppedCount: agented.droppedCount,
    secondaryOnlyCount: secondary.secondaryOnlyCount,
    secondaryReviewSkippedReason: secondary.skippedReason,
    secondaryModel: secondary.secondaryModel,
    usage: secondary.usage ?? agented.usage,
  }
}

export async function runPostLoopQualityReview(
  loopDir: string,
  goal: string,
  ctx: RepoContext,
  options: PostLoopReviewOptions = {},
): Promise<PostLoopReviewResult> {
  const reviewCycle = options.reviewCycle ?? 1
  const reviewAgent = resolvePostLoopReviewAgent(options)
  const prompt = buildPostLoopQualityReviewPrompt(ctx, goal)
  const run = await runReviewAgentPrompt(ctx, prompt, reviewAgent, {
    verbose: options.verbose,
  })
  const piped = await applyPostPrimaryReviewPipeline(
    parseReviewMarkdown(run.text),
    run.text,
    goal,
    ctx,
    options,
  )
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  const secondaryNote = piped.secondaryModel
    ? `\n_Secondary model: ${piped.secondaryModel}_\n`
    : piped.secondaryReviewSkippedReason && options.reviewSecondaryRuntime
      ? `\n_Secondary review skipped (${piped.secondaryReviewSkippedReason})_\n`
      : ''
  fs.writeFileSync(
    outPath,
    `# Post-loop quality review\n\n_Primary judge: ${formatReviewAgentLabel(reviewAgent)}_${secondaryNote}\n_Generated ${new Date().toISOString()}_\n\n${piped.text.trim()}\n`,
    'utf8',
  )
  console.error(
    `[agent-loop] quality review written: ${path.relative(ctx.repoRoot, outPath)} (judge=${formatReviewAgentLabel(reviewAgent)})`,
  )
  console.error(
    `[agent-loop] quality review verdict=${piped.parsed.verdict} risk=${piped.parsed.risk} blockers=${piped.parsed.blockers.length} gating=${blockingBlockers(piped.parsed).length}`,
  )
  return {
    text: piped.text,
    parsed: piped.parsed,
    outPath,
    usage: piped.usage ?? run.usage,
    reproduceDroppedCount: piped.reproduceDroppedCount,
    reproduceAgentDroppedCount: piped.reproduceAgentDroppedCount,
    secondaryOnlyBlockersCount: piped.secondaryOnlyCount,
    secondaryReviewSkippedReason: piped.secondaryReviewSkippedReason,
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
  const reviewAgent = resolvePostLoopReviewAgent(options)
  const prompt = buildBlockerRecheckPrompt(ctx, goal, blockers)
  const run = await runReviewAgentPrompt(ctx, prompt, reviewAgent, {
    verbose: options.verbose,
  })
  const piped = await applyPostPrimaryReviewPipeline(
    parseReviewMarkdown(run.text),
    run.text,
    goal,
    ctx,
    options,
  )
  const outPath = resolveReviewOutputPath(loopDir, reviewCycle)
  const secondaryNote = piped.secondaryModel
    ? `\n_Secondary model: ${piped.secondaryModel}_\n`
    : piped.secondaryReviewSkippedReason && options.reviewSecondaryRuntime
      ? `\n_Secondary review skipped (${piped.secondaryReviewSkippedReason})_\n`
      : ''
  fs.writeFileSync(
    outPath,
    `# Blocker re-check\n\n_Primary judge: ${formatReviewAgentLabel(reviewAgent)}_${secondaryNote}\n_Generated ${new Date().toISOString()}_\n\n${piped.text.trim()}\n`,
    'utf8',
  )
  console.error(
    `[agent-loop] blocker re-check written: ${path.relative(ctx.repoRoot, outPath)} (judge=${formatReviewAgentLabel(reviewAgent)})`,
  )
  console.error(
    `[agent-loop] blocker re-check verdict=${piped.parsed.verdict} risk=${piped.parsed.risk} blockers=${piped.parsed.blockers.length} gating=${blockingBlockers(piped.parsed).length}`,
  )
  return {
    text: piped.text,
    parsed: piped.parsed,
    outPath,
    usage: piped.usage ?? run.usage,
    reproduceDroppedCount: piped.reproduceDroppedCount,
    reproduceAgentDroppedCount: piped.reproduceAgentDroppedCount,
    secondaryOnlyBlockersCount: piped.secondaryOnlyCount,
    secondaryReviewSkippedReason: piped.secondaryReviewSkippedReason,
  }
}

import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import { buildReviewOutputFormatReminder } from './reviewPrompt.js'

export const META_REVIEW_PROMPT_RELATIVE = 'docs/meta-review-prompt.md'

const META_PROMPT_BOUND = 6000

export type CollectedLoopArtifacts = {
  loopDir: string
  relPath: string
  goal?: string
  review?: { path: string; content: string }
  logNdjson?: string
  failureDomains?: string
  diffStat: string
  missing: string[]
}

export function resolveMetaReviewPromptPath(repoRoot: string): string {
  return path.join(repoRoot, META_REVIEW_PROMPT_RELATIVE)
}

export function loadMetaReviewPromptBrief(repoRoot: string): string {
  const promptPath = resolveMetaReviewPromptPath(repoRoot)
  if (!fs.existsSync(promptPath)) {
    return `(meta-review prompt not found at ${META_REVIEW_PROMPT_RELATIVE} — apply cross-loop residual review from docs/loop-review-roadmap.md §5.)`
  }
  const raw = fs.readFileSync(promptPath, 'utf8').trim()
  if (raw.length <= META_PROMPT_BOUND) return raw
  return `${raw.slice(0, META_PROMPT_BOUND)}\n\n… (truncated meta-review brief; full outline in ${META_REVIEW_PROMPT_RELATIVE})`
}

function formatLoopArtifactBlock(bundle: CollectedLoopArtifacts): string {
  const lines: string[] = [
    `### Loop: ${bundle.relPath}`,
    bundle.goal ? `**Goal (excerpt):** ${bundle.goal.split('\n').slice(0, 8).join(' ').slice(0, 400)}` : '**Goal:** (missing GOAL.md)',
  ]

  if (bundle.missing.length > 0) {
    lines.push(`**Missing artifacts:** ${bundle.missing.join(', ')}`)
  }

  if (bundle.review) {
    lines.push(`**Latest review:** \`${path.basename(bundle.review.path)}\``)
    lines.push('```markdown')
    lines.push(bundle.review.content.slice(0, 4000))
    lines.push('```')
  } else {
    lines.push('**Latest review:** (none)')
  }

  if (bundle.logNdjson) {
    lines.push('**log.ndjson (tail):**')
    lines.push('```json')
    lines.push(bundle.logNdjson.split('\n').slice(-12).join('\n'))
    lines.push('```')
  }

  if (bundle.failureDomains) {
    lines.push('**failure-domains.ndjson:**')
    lines.push('```json')
    lines.push(bundle.failureDomains.split('\n').slice(-8).join('\n'))
    lines.push('```')
  }

  lines.push('**Diff stat vs defaultBranch:**')
  lines.push('```')
  lines.push(bundle.diffStat || '(no diff)')
  lines.push('```')

  return lines.join('\n')
}

export function buildMetaReviewPrompt(
  ctx: RepoContext,
  bundles: CollectedLoopArtifacts[],
): string {
  const brief = loadMetaReviewPromptBrief(ctx.repoRoot)
  const loopBlocks = bundles.map(formatLoopArtifactBlock).join('\n\n')

  return `You are performing a **read-only cross-loop meta-review** across ${bundles.length} loop bundle(s).
Do NOT edit files. Do NOT mark individual loops complete or incomplete. Do NOT re-run implement workers.

${buildReviewOutputFormatReminder()}

Also include these sections (required):
### Cross-loop themes
### HITL follow-ups

For ### HITL follow-ups bullets, prefer exact \`task add project:<p> -- '…'\` lines when human closure is needed.

## Meta-review brief (${META_REVIEW_PROMPT_RELATIVE})
${brief}

Repo: ${ctx.repoRoot}
Default branch: ${ctx.profile.defaultBranch}

## Collected loop artifacts
${loopBlocks}
`
}

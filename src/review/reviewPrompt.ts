import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import type { RepoProfile } from '../context/repoProfile.js'

export const REVIEWS_MD = 'REVIEWS.md'

export function buildRiskTriagePreamble(): string {
  return `Review this change by **risk (blast radius), not by diff size**.

**Step 1 — Classify risk**
1. **HIGH:** auth, identity, payments, data access, network egress, PII, security, production DB writes/migrations, deploy workflows, secrets, CaMeL/agentic tools, Telegram admin/CRM.
2. **MEDIUM:** business logic, user-facing behavior, integrations, performance-sensitive paths, webhooks.
3. **LOW:** UI/copy, formatting, internal tooling, validators/scorers, docs, test-only refactors with coverage.

**Step 2 — Answer (concrete, repo-specific)**
- What could go wrong?
- What needs line-by-line review vs skim?
- What can be verified empirically?
- Should this ship behind a feature flag, staging-only, sandbox, or shadow mode?
- What guardrails would make merge faster (tests, HITL, rollback)?`
}

export function buildReviewOutputFormatReminder(): string {
  return `Output **markdown only**:
### Risk | ### What could go wrong? | ### Review depth | ### Verdict (PASS | ADVISORY | BLOCKERS) | ### Blockers | ### Advisory | optional Code judo / Nits.`
}

export function loadReviewsMd(repoRoot: string, profile: RepoProfile): string {
  const reviewsPath = path.join(repoRoot, profile.reviewsFile)
  if (!fs.existsSync(reviewsPath)) {
    return `(REVIEWS.md not found — apply code judo bar from AGENTS.md and repo coding standards.)`
  }
  return fs.readFileSync(reviewsPath, 'utf8').trim()
}

export type QualityReviewPromptOptions = {
  ctx: RepoContext
  context: string
  diffStat: string
  reviewKind?: string
}

export function buildQualityReviewPrompt(options: QualityReviewPromptOptions): string {
  const { ctx, context, diffStat, reviewKind = 'unified code review' } = options
  const reviewsMd = loadReviewsMd(ctx.repoRoot, ctx.profile)

  return `You are performing a **read-only** ${reviewKind}.
Apply the repository review standards below.
Do NOT edit files.

${buildRiskTriagePreamble()}

${buildReviewOutputFormatReminder()}

Repo: ${ctx.repoRoot}

## Context
${context}

## Diff stat
\`\`\`
${diffStat || '(no diff)'}
\`\`\`

## Repository review standards (${ctx.profile.reviewsFile})
${reviewsMd}
`
}

export function buildThermoNuclearReviewPrompt(ctx: RepoContext, diffStat: string): string {
  return buildQualityReviewPrompt({
    ctx,
    context: `Thermo-nuclear code quality audit of the current branch changes vs ${ctx.profile.defaultBranch}.
Rethink structure so behavior stays the same but implementation becomes simpler and more direct.`,
    diffStat,
    reviewKind: 'thermo-nuclear code quality audit',
  })
}

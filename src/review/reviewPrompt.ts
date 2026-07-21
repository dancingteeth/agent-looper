import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import type { RepoProfile } from '../context/repoProfile.js'

/** Default reviews filename label in prompts — actual path is `profile.reviewsFile`. */
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
### Risk | ### What could go wrong? | ### Review depth | ### Verdict (PASS | ADVISORY | BLOCKERS) | ### Blockers | ### Advisory | optional Code judo / Nits.

**Blocker contract (required for ### Blockers bullets):**
- Start each bullet with \`severity: error|warning\` and \`impact: <tag>\`.
- **Default cosmetic findings to** \`severity: warning impact: none\` — do not use BLOCKERS verdict for style-only nits.
- **Gate-worthy impacts** (use \`severity: error\` only when real): \`data-loss\`, \`security-boundary\`, \`false-closure\`, \`cross-dispatch\`, \`verify-bypass\`.
- Example: \`- severity: error impact: false-closure [must-fix] **Docs missing** — README still template\`
- Example warning: \`- severity: warning impact: none [should-fix] **Tone** — prefer active voice in intro\``
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

/**
 * Lighter, scope-limited re-check used on a BLOCKERS fix round. It only judges
 * whether the previously-flagged blockers are now resolved — it must NOT surface
 * new blockers, so a model can't block completion on an irrelevant finding.
 */
export function buildBlockerRecheckPrompt(
  ctx: RepoContext,
  goal: string,
  blockers: string[],
): string {
  const numbered = blockers.map((b, idx) => `${idx + 1}. ${b}`).join('\n')
  return `You are performing a **read-only** blocker re-check after the agent attempted to resolve previously-flagged blockers. Do NOT introduce new blockers — only assess whether the items below are now resolved. Do NOT edit files.

Apply the repository review standards below for context only.

${buildRiskTriagePreamble()}

Repo: ${ctx.repoRoot}

## Loop goal
${goal}

## Blockers to verify (resolve each one)
${numbered}

## Task
For each blocker above, decide RESOLVED or REMAINING, then give a verdict:
### Verdict
**PASS** — every listed blocker is resolved.
**BLOCKERS** — at least one listed blocker remains unresolved.
### Blockers
- list only the REMAINING (unresolved) blockers; omit the section if none.
- Preserve \`severity:\` and \`impact:\` prefixes from the original blocker when listing REMAINING items.

## Repository review standards (${ctx.profile.reviewsFile})
${loadReviewsMd(ctx.repoRoot, ctx.profile)}
`
}

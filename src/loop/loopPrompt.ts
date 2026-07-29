import type { LoopMode } from './loopMode.js'
import { buildReverseModePromptSection } from './loopMode.js'
import { buildFailureContextPromptSection } from './loopFailureContext.js'
import type { GitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'
import { renderLoopPromptRulesSection } from './loopSafetyRules.js'
import {
  formatGuidePacketsForPrompt,
  type GuidePacket,
} from '../review/guidePackets.js'

export type LoopPromptInput = {
  goal: string
  iteration: number
  maxIterations: number
  git: GitWorkspaceSnapshot
  lastVerify: VerifyResult | null
  priorFailures: VerifyResult[]
  stagnationRepeatCount?: number
  agentsFile?: string
  /** @deprecated Prefer guidePackets — kept for callers that only have raw lines. */
  reviewBlockers?: string[]
  /** Structured Guide feedback from reviewGate continue (preferred over reviewBlockers). */
  guidePackets?: GuidePacket[]
  /** Inlined epic skill runbooks (from GOAL / loop.json). */
  skillsSection?: string
  /** Per-batch fan-out rubric (prompt-only; does not rewrite GOAL.md). */
  batchRubric?: string
  mode?: LoopMode
  failureContext?: string
}

export function buildAgentLoopPrompt(input: LoopPromptInput): string {
  const agentsFile = input.agentsFile ?? 'AGENTS.md'
  const failureSection =
    input.priorFailures.length === 0
      ? 'None yet — first iteration or last verifier passed.'
      : input.priorFailures
          .map(
            (f, i) =>
              `### Failure ${i + 1}\nCommand: \`${f.command}\`\nReason: ${f.reason}\n\`\`\`\n${formatVerifyOutput(f)}\n\`\`\``,
          )
          .join('\n\n')

  const lastSection = input.lastVerify
    ? `Command: \`${input.lastVerify.command}\`\nReason: ${input.lastVerify.reason}\n\`\`\`\n${formatVerifyOutput(input.lastVerify)}\n\`\`\``
    : 'No verifier run yet this session.'

  const stagnationSection =
    input.stagnationRepeatCount !== undefined
      ? `## Stagnation warning

The verifier failed **${input.stagnationRepeatCount}** times with the same output signature. Change approach: different file or layer, or fix the root cause below — do not repeat the same edit pattern.

`
      : ''

  const reviewGuideSection = buildReviewGuideSection(input)

  const modeSection = input.mode === 'reverse' ? buildReverseModePromptSection() : ''
  const failureContextSection =
    input.failureContext && input.failureContext.trim()
      ? buildFailureContextPromptSection(input.failureContext.trim())
      : ''

  const skillsSection =
    input.skillsSection && input.skillsSection.trim()
      ? `${input.skillsSection.trim()}\n\n`
      : ''

  const rulesSection = renderLoopPromptRulesSection(agentsFile)
  const batchRubricSection = buildBatchRubricSection(input.batchRubric)

  // Stable head first (intro + goal + skills + mode + rules) so the prompt prefix is
  // byte-identical across iterations and the provider prefix cache is reused. Volatile
  // content (git snapshot, batch rubric, verifier results, failures, stagnation, review
  // guides, failure context) and the iteration counter go last.
  return `You are a coding agent in a fresh-context fix-until-green loop.
An external shell verifier decides success — do not claim the task is finished.

## Goal

${input.goal}

${skillsSection}${modeSection}${rulesSection}

## Workspace (git)

- Branch: ${input.git.branch}
- HEAD: ${input.git.shortSha}
- Status:
\`\`\`
${input.git.statusPorcelain}
\`\`\`
- Diff stat:
\`\`\`
${input.git.diffStat}
\`\`\`

${batchRubricSection}## Last verifier result

${lastSection}

## Prior verifier failures (recent)

${failureSection}

${stagnationSection}${reviewGuideSection}${failureContextSection}## This iteration

Iteration ${input.iteration} of ${input.maxIterations}.
`
}

function buildBatchRubricSection(batchRubric?: string): string {
  if (!batchRubric?.trim()) return ''
  return `## Batch rubric

${batchRubric.trim()}

`
}

function buildReviewGuideSection(input: LoopPromptInput): string {
  if (input.guidePackets && input.guidePackets.length > 0) {
    return `## Guide packets (must fix)

The verifier passed, but the post-loop quality review returned **gating** findings (**Guide** / Deny). Fix each **Required change** that is achievable **in-repo** (code, docs, tests). Do **not** expand scope beyond the goal.

Out-of-repo items (task UUIDs, merge policy, human-only deploy) cannot be fixed by you — ignore those if listed.

${formatGuidePacketsForPrompt(input.guidePackets)}

`
  }

  if (input.reviewBlockers && input.reviewBlockers.length > 0) {
    return `## Review blockers (must fix)

The verifier passed, but the post-loop quality review returned **BLOCKERS**. Fix the items below that are achievable **in-repo** (code, docs, tests). Do **not** expand scope beyond the goal.

Out-of-repo blockers (task traceability UUIDs, merge policy for unrelated branch diffs, human-only deploy steps) cannot be fixed by you — ignore those if listed.

${input.reviewBlockers.map((b, i) => `${i + 1}. ${b}`).join('\n')}

`
  }

  return ''
}

function formatVerifyOutput(verify: VerifyResult): string {
  const parts: string[] = []
  if (verify.stdout.trim()) parts.push(verify.stdout.trim())
  if (verify.stderr.trim()) parts.push(verify.stderr.trim())
  return parts.join('\n---\n') || '(no output)'
}

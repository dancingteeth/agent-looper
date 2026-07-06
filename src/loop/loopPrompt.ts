import type { LoopMode } from './loopMode.js'
import { buildReverseModePromptSection } from './loopMode.js'
import { buildFailureContextPromptSection } from './loopFailureContext.js'
import type { GitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'
import { renderLoopPromptRulesSection } from './loopSafetyRules.js'

export type LoopPromptInput = {
  goal: string
  iteration: number
  maxIterations: number
  git: GitWorkspaceSnapshot
  lastVerify: VerifyResult | null
  priorFailures: VerifyResult[]
  stagnationRepeatCount?: number
  agentsFile?: string
  reviewBlockers?: string[]
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

  const reviewBlockersSection =
    input.reviewBlockers && input.reviewBlockers.length > 0
      ? `## Review blockers (must fix)

The verifier passed, but the post-loop quality review returned **BLOCKERS**. Fix the items below that are achievable **in-repo** (code, docs, tests). Do **not** expand scope beyond the goal.

Out-of-repo blockers (task traceability UUIDs, merge policy for unrelated branch diffs, human-only deploy steps) cannot be fixed by you — ignore those if listed.

${input.reviewBlockers.map((b, i) => `${i + 1}. ${b}`).join('\n')}

`
      : ''

  const modeSection = input.mode === 'reverse' ? buildReverseModePromptSection() : ''
  const failureContextSection =
    input.failureContext && input.failureContext.trim()
      ? buildFailureContextPromptSection(input.failureContext.trim())
      : ''

  return `You are a coding agent in a **fresh context** (iteration ${input.iteration} of ${input.maxIterations}).
An external shell verifier decides success — do not claim the task is finished.

## Goal

${input.goal}

${modeSection}${failureContextSection}${reviewBlockersSection}${stagnationSection}## Workspace (git)

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

## Last verifier result

${lastSection}

## Prior verifier failures (recent)

${failureSection}

${renderLoopPromptRulesSection(agentsFile)}`
}

function formatVerifyOutput(verify: VerifyResult): string {
  const parts: string[] = []
  if (verify.stdout.trim()) parts.push(verify.stdout.trim())
  if (verify.stderr.trim()) parts.push(verify.stderr.trim())
  return parts.join('\n---\n') || '(no output)'
}

import type { GitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'

export type LoopPromptInput = {
  goal: string
  iteration: number
  maxIterations: number
  git: GitWorkspaceSnapshot
  lastVerify: VerifyResult | null
  priorFailures: VerifyResult[]
  stagnationRepeatCount?: number
  agentsFile?: string
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

  return `You are a coding agent in a **fresh context** (iteration ${input.iteration} of ${input.maxIterations}).
An external shell verifier decides success — do not claim the task is finished.

## Goal

${input.goal}

${stagnationSection}## Workspace (git)

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

## Rules

1. Make **small, incremental** edits toward the goal.
2. Follow \`${agentsFile}\` and existing repo conventions.
3. Do **not** run destructive git commands (\`reset --hard\`, force push, etc.).
4. Do **not** expand scope beyond the goal.
5. Prefer fixing root causes shown in verifier output over disabling tests.
6. Do **not** edit \`GOAL.md\` — the spec is frozen for this loop run.`
}

function formatVerifyOutput(verify: VerifyResult): string {
  const parts: string[] = []
  if (verify.stdout.trim()) parts.push(verify.stdout.trim())
  if (verify.stderr.trim()) parts.push(verify.stderr.trim())
  return parts.join('\n---\n') || '(no output)'
}

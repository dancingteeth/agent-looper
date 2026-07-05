import fs from 'node:fs'
import path from 'node:path'
import type { AgentLoopResult } from './agentLoop.js'
import type { VerifyResult } from './loopVerify.js'

export const FAILURE_CONTEXT_FILENAME = 'failure-context.md'

export function failureContextPath(loopDir: string): string {
  return path.join(loopDir, FAILURE_CONTEXT_FILENAME)
}

export function clearFailureContext(loopDir: string): void {
  const filePath = failureContextPath(loopDir)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.error(`[agent-loop] cleared stale ${FAILURE_CONTEXT_FILENAME}`)
  }
}

function formatVerifyBlock(verify: VerifyResult | null): string {
  if (!verify) return '(no verifier result)'
  const output = [verify.stdout, verify.stderr].filter((s) => s.trim()).join('\n---\n')
  return `Command: \`${verify.command}\`
Exit: ${verify.exitCode ?? 'null'}
Reason: ${verify.reason}

\`\`\`
${output.trim() || '(no output)'}
\`\`\``
}

export function writeFailureContext(
  fixLoopDir: string,
  options: {
    probeLoopDir: string
    probeResult: AgentLoopResult
    cycle: number
    maxCycles: number
  },
): void {
  const { probeResult, probeLoopDir, cycle, maxCycles } = options
  const content = `# Failure context (meta-loop cycle ${cycle}/${maxCycles})

Written automatically when probe loop \`${probeLoopDir}\` failed.

## Probe completion

- Complete: ${probeResult.complete}
- Iterations: ${probeResult.iterations}
- Reason: ${probeResult.completionReason}

## Last verifier

${formatVerifyBlock(probeResult.lastVerify)}

## Your job

Fix the failures above so the probe loop passes on the next meta-loop cycle.
Stay within GOAL.md — do not expand scope.
`
  fs.writeFileSync(failureContextPath(fixLoopDir), content, 'utf8')
  console.error(
    `[agent-loop] wrote ${FAILURE_CONTEXT_FILENAME} → ${path.basename(fixLoopDir)}/`,
  )
}

export function readFailureContext(loopDir: string): string | undefined {
  const filePath = failureContextPath(loopDir)
  if (!fs.existsSync(filePath)) return undefined
  const text = fs.readFileSync(filePath, 'utf8').trim()
  return text || undefined
}

export function buildFailureContextPromptSection(context: string): string {
  return `## Injected failure context (meta-loop)

The probe loop failed and wrote context for this fix round:

${context}

`
}

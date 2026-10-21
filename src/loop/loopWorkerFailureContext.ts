import fs from 'node:fs'
import { FAILURE_CONTEXT_FILENAME, failureContextPath } from './loopFailureContext.js'
import type { VerifyResult } from './loopVerify.js'

export function appendWorkerAgentFailureContext(
  loopDir: string,
  input: { iteration: number; message: string; verify: VerifyResult },
): void {
  const filePath = failureContextPath(loopDir)
  const header = `## Worker agent error (iteration ${input.iteration})`
  const block = `${header}

${input.verify.reason}

\`\`\`
${input.message.trim()}
\`\`\`
`
  if (fs.existsSync(filePath)) {
    fs.appendFileSync(filePath, `\n${block}`, 'utf8')
  } else {
    fs.writeFileSync(
      filePath,
      `# Failure context\n\n${block}`,
      'utf8',
    )
  }
  console.error(`[agent-loop] appended worker fault to ${FAILURE_CONTEXT_FILENAME}`)
}

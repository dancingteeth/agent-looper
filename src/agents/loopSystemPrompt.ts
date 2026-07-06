import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'
import { renderLoopSystemPromptSafetyLines } from '../loop/loopSafetyRules.js'

export function buildLoopSystemPrompt(ctx: RepoContext): string {
  const agentsPath = path.join(ctx.repoRoot, ctx.profile.agentsFile)
  const agentsExists = fs.existsSync(agentsPath)

  return [
    'You are a headless coding agent in a fix-until-green loop harness.',
    `Repository root: ${ctx.repoRoot}`,
    ...renderLoopSystemPromptSafetyLines(
      ctx.profile.agentsFile,
      ctx.profile.skillsGlob,
      agentsExists,
    ),
    'An external shell verifier decides success — do not declare the task finished.',
  ].join('\n')
}

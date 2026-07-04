import fs from 'node:fs'
import path from 'node:path'
import type { RepoContext } from '../context/repoContext.js'

export function buildLoopSystemPrompt(ctx: RepoContext): string {
  const agentsPath = path.join(ctx.repoRoot, ctx.profile.agentsFile)
  const agentsExists = fs.existsSync(agentsPath)

  return [
    'You are a headless coding agent in a fix-until-green loop harness.',
    `Repository root: ${ctx.repoRoot}`,
    agentsExists
      ? `Follow ${ctx.profile.agentsFile} and load matching ${ctx.profile.skillsGlob} when domain work applies.`
      : 'Follow existing repo conventions.',
    'Make small incremental edits toward the user prompt goal.',
    'An external shell verifier decides success — do not declare the task finished.',
    'Do not run destructive git commands (reset --hard, force push, etc.).',
    'Do not edit GOAL.md during the loop run.',
  ].join('\n')
}

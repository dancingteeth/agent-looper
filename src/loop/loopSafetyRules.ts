export const LOOP_SAFETY_RULES = [
  'Make small, incremental edits toward the goal.',
  'Follow the repo agents file and existing conventions.',
  'Do not run destructive git commands (reset --hard, force push, etc.).',
  'Do not expand scope beyond the goal.',
  'Prefer fixing root causes shown in verifier output over disabling tests.',
  'Do not edit GOAL.md — the spec is frozen for this loop run.',
] as const

export function renderLoopPromptRulesSection(agentsFile: string): string {
  const rules = [
    `1. Make **small, incremental** edits toward the goal.`,
    `2. Follow \`${agentsFile}\` and existing repo conventions.`,
    `3. Do **not** run destructive git commands (\`reset --hard\`, force push, etc.).`,
    `4. Do **not** expand scope beyond the goal.`,
    `5. Prefer fixing root causes shown in verifier output over disabling tests.`,
    `6. Do **not** edit \`GOAL.md\` — the spec is frozen for this loop run.`,
  ]
  return `## Rules\n\n${rules.join('\n')}`
}

export function renderLoopSystemPromptSafetyLines(
  agentsFile: string,
  skillsGlob: string,
  agentsExists = true,
): string[] {
  const agentsLine = agentsExists
    ? `Follow ${agentsFile} and load matching ${skillsGlob} when domain work applies.`
    : 'Follow existing repo conventions.'

  return [
    'Make small incremental edits toward the user prompt goal.',
    agentsLine,
    'Do not run destructive git commands (reset --hard, force push, etc.).',
    'Do not expand scope beyond the goal.',
    'Prefer fixing root causes shown in verifier output over disabling tests.',
    'Do not edit GOAL.md during the loop run.',
  ]
}

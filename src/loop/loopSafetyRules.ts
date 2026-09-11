import { FROZEN_LOOP_BASENAMES } from './loopFrozenFiles.js'

/** Every file the harness restores after a visit — keep the worker rule in sync with the enforcement. */
const FROZEN_FILES_PLAIN = FROZEN_LOOP_BASENAMES.join(', ')
const FROZEN_FILES_MARKDOWN = FROZEN_LOOP_BASENAMES.map((name) => `\`${name}\``).join(', ')

export const LOOP_SAFETY_RULES = [
  'Make small, incremental edits toward the goal.',
  'Follow the repo agents file and existing conventions.',
  'Do not run destructive git commands (reset --hard, force push, etc.).',
  'Do not expand scope beyond the goal.',
  'Prefer fixing root causes shown in verifier output over disabling tests.',
  `Do not edit ${FROZEN_FILES_PLAIN} — the harness restores them and fails the visit if you do.`,
] as const

export function renderLoopPromptRulesSection(agentsFile: string): string {
  const rules = [
    `1. Make **small, incremental** edits toward the goal.`,
    `2. Follow \`${agentsFile}\` and existing repo conventions.`,
    `3. Do **not** run destructive git commands (\`reset --hard\`, force push, etc.).`,
    `4. Do **not** expand scope beyond the goal.`,
    `5. Prefer fixing root causes shown in verifier output over disabling tests.`,
    `6. Do **not** edit ${FROZEN_FILES_MARKDOWN} — the harness restores them and fails the visit if you do.`,
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
    `Do not edit ${FROZEN_FILES_PLAIN} during the loop run.`,
  ]
}

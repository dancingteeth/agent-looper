/** Bundle files the scaffold agent may write or update. */
export const SCAFFOLD_BUNDLE_FILES = [
  'GOAL.md',
  'verify.sh',
  'RESEARCH.md',
  'VERIFY.skill.md',
  'PERMISSIONS.md',
] as const

/** Scaffold is two spec files, not a 45-minute implement turn. */
export const SCAFFOLD_SESSION_TIMEOUT_MS = 10 * 60 * 1000

export function buildScaffoldPrompt(loopDir: string, idea: string): string {
  const rel = loopDir.replace(/\\/g, '/')
  return [
    '# Agent Looper — scaffold only (judge, not worker)',
    '',
    'Write TWO files under the loop directory, then STOP.',
    'Do not implement the product. Do not run tsc, vitest, vite, npm test, or any build.',
    'Do not copy sibling loops (museum, museum2, …) into src/ — those are other tasks.',
    'Do not edit files outside the loop directory. Do not read other git repos.',
    'The human idea is the outcome; do not shrink it into a toy subset to make verify easy.',
    '',
    `Loop directory: \`${rel}\``,
    `Required: \`${rel}/GOAL.md\` and \`${rel}/verify.sh\``,
    '',
    '## Human idea',
    '',
    idea.trim(),
    '',
    '## GOAL.md',
    '',
    'Must include heading `## Acceptance criteria` and the sentence',
    '`Success is determined only by the verifier in loop.json` (harness preflight).',
    'Four-part finish line: outcome, scoreboard (`verify.sh` exit 0), permission, budget.',
    'If this idea is visual/UI, name who must like it and what would close the tab.',
    '',
    '## verify.sh',
    '',
    'Executable. Exit 0 only on real success. Loop over required titles/ids; assert rituals.',
    'Freeze lint refuses gameable greps: no `grep -qE \'Title A|Title B\'` (one match passes);',
    'no `"[^"]+"` caption/string extractors on TS.',
    'Do not run verify.sh during scaffold.',
    '',
    'Optional only under the loop dir: RESEARCH.md, VERIFY.skill.md, PERMISSIONS.md.',
    'loop.json: you may set `verify` to the verify.sh path and optional `preview`. No other keys.',
    '',
    'When both required files exist, stop. Reply with the file list.',
  ].join('\n')
}

import fs from 'node:fs'
import path from 'node:path'

export const LOOP_GITIGNORE_MARKER = '# agent-loop runtime artifacts'

const LOOP_GITIGNORE_LINES: readonly string[] = [
  LOOP_GITIGNORE_MARKER,
  '.cursor/sdk-runs/',
  '.cursor/loops/**/log.ndjson',
  '.cursor/loops/**/watch-status.json',
  '.cursor/loops/**/failure-domains.ndjson',
  '.cursor/loops/**/failure-context.md',
  '.cursor/loops/**/review.md',
  '.cursor/loops/**/review.*.md',
  '.cursor/loops/**/run-report.md',
  '.cursor/loops/**/transcript.ndjson',
  '.cursor/loops/**/assistant.stream',
  '.cursor/loops/**/prompt-run.log',
  '.cursor/loops/**/verify-logs/',
]

/**
 * Append the loop-artifact ignore block to the repo's .gitignore (created when
 * missing). Idempotent: skips when the marker line is already present.
 *
 * In-loop working artifacts (logs, reviews, transcripts) stay ignored — they are
 * noisy mid-run. Curated snapshots go to `.cursor/loop-exports/` (not ignored)
 * for cloud/PR/meta-review.
 */
export function ensureLoopGitignoreBlock(repoRoot: string): 'written' | 'skipped' {
  const gitignorePath = path.join(repoRoot, '.gitignore')
  const existing = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, 'utf8')
    : ''
  if (existing.includes(LOOP_GITIGNORE_MARKER)) return 'skipped'
  const separator = existing.length === 0 ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
  fs.writeFileSync(
    gitignorePath,
    `${existing}${separator}${LOOP_GITIGNORE_LINES.join('\n')}\n`,
    'utf8',
  )
  return 'written'
}

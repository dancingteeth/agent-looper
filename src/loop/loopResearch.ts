import fs from 'node:fs'
import path from 'node:path'
import { skillIndexEntryFromFile } from './loopSkills.js'

export const RESEARCH_FILENAME = 'RESEARCH.md'

function posixRel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

function resolveExplicitResearchPath(
  explicit: string,
  loopDir: string,
  repoRoot: string,
): string {
  if (path.isAbsolute(explicit)) {
    return path.resolve(explicit)
  }
  const fromLoop = path.resolve(loopDir, explicit)
  if (fs.existsSync(fromLoop)) {
    return fromLoop
  }
  return path.resolve(repoRoot, explicit)
}

function cellText(value: string): string {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim()
}

/**
 * Relative path (posix) of the frozen brownfield map, if any.
 * Uses `loop.json` `research` when set; otherwise `RESEARCH.md` beside GOAL.md.
 */
export function resolveLoopResearchRelativePath(
  loopDir: string,
  repoRoot: string,
  explicit?: string,
): string | undefined {
  if (explicit?.trim()) {
    return posixRel(repoRoot, resolveExplicitResearchPath(explicit.trim(), loopDir, repoRoot))
  }
  const sibling = path.join(loopDir, RESEARCH_FILENAME)
  if (!fs.existsSync(sibling)) return undefined
  return posixRel(repoRoot, sibling)
}

export function loadLoopResearchSection(repoRoot: string, relativePath: string): string {
  const abs = path.join(repoRoot, relativePath)
  const raw = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : undefined
  const entry = skillIndexEntryFromFile(relativePath, raw)
  const when = entry.missing
    ? 'missing on disk — Read the path if you can recover it'
    : entry.description || 'Read before the first edit.'

  return [
    '## Research (index)',
    '',
    'Frozen brownfield map. **Read** this path before editing. Do **not** edit the file mid-run (frozen with GOAL.md). It is not the finish line — `verify.sh` still decides. If verify contradicts this map, trust verify.',
    '',
    '| Name | Path | When to load |',
    '| --- | --- | --- |',
    `| research | \`${relativePath}\` | ${cellText(when)} |`,
  ].join('\n')
}

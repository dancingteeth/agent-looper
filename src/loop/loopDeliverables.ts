import fs from 'node:fs'
import path from 'node:path'

/**
 * True when `rel` is a repo-relative path that stays inside the repo: not absolute
 * (POSIX or Windows drive/UNC) and no `..` escape after normalisation.
 */
export function isConfinedDeliverablePath(rel: string): boolean {
  if (!rel.trim()) return false
  if (path.isAbsolute(rel) || path.win32.isAbsolute(rel)) return false
  const normalized = path.posix.normalize(rel.replace(/\\/g, '/'))
  return normalized !== '..' && !normalized.startsWith('../') && normalized !== '.'
}

function resolvesInside(repoRoot: string, rel: string): boolean {
  const root = path.resolve(repoRoot)
  const abs = path.resolve(root, rel)
  const relative = path.relative(root, abs)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/**
 * Repo-relative paths that are missing or empty, in input order. Paths that are
 * absolute or resolve outside `repoRoot` are never reported (the harness must not
 * point the worker outside the repo); `loopConfigSchema` rejects them up front.
 */
export function missingDeliverables(
  repoRoot: string,
  deliverables: readonly string[],
): string[] {
  const missing: string[] = []
  for (const rel of deliverables) {
    if (!isConfinedDeliverablePath(rel) || !resolvesInside(repoRoot, rel)) continue
    const abs = path.join(repoRoot, rel)
    try {
      const stat = fs.statSync(abs)
      if (!stat.isFile() || stat.size === 0) {
        missing.push(rel)
      }
    } catch {
      missing.push(rel)
    }
  }
  return missing
}

export function buildDeliverableNudgeSection(missing: readonly string[]): string {
  const lines = missing.map((p) => `- \`${p}\``)
  return `## Deliverables missing

Create or fill in these repo-relative files before the verifier runs:

${lines.join('\n')}
`
}

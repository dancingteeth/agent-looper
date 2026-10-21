import fs from 'node:fs'
import path from 'node:path'

/** Repo-relative paths that are missing or empty, in input order. */
export function missingDeliverables(
  repoRoot: string,
  deliverables: readonly string[],
): string[] {
  const missing: string[] = []
  for (const rel of deliverables) {
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

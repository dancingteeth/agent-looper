import fs from 'node:fs'
import path from 'node:path'

/** Package-relative source (also listed in package.json `files` + dist-manifest). */
export const CHECK_RUNNING_LOOPS_REL = path.join(
  'plugins',
  'agent-looper',
  'skills',
  'check-running-loops',
)

export const CHECK_RUNNING_LOOPS_FILES = [
  'SKILL.md',
  path.join('scripts', 'check-running-loops.sh'),
] as const

/** Project skill dirs Cursor (`.cursor/skills`) and other agents (`.agents/skills`) read. */
export const CHECK_RUNNING_LOOPS_PROJECT_DESTS = [
  path.join('.cursor', 'skills', 'check-running-loops'),
  path.join('.agents', 'skills', 'check-running-loops'),
] as const

export type InitSkillCopyResult = {
  dest: string
  action: 'written' | 'skipped'
}

function copySkillFile(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  if (dest.endsWith('.sh')) {
    fs.chmodSync(dest, 0o755)
  }
}

/**
 * Copy check-running-loops (SKILL.md + heartbeat script) into the consumer repo.
 * Skips a dest tree when SKILL.md already exists unless `force`.
 */
export function copyCheckRunningLoopsSkill(
  repoRoot: string,
  packageRoot: string,
  force: boolean,
): InitSkillCopyResult[] {
  const srcRoot = path.join(packageRoot, CHECK_RUNNING_LOOPS_REL)
  for (const rel of CHECK_RUNNING_LOOPS_FILES) {
    const src = path.join(srcRoot, rel)
    if (!fs.existsSync(src)) {
      throw new Error(`Missing package skill file: ${src}`)
    }
  }

  const results: InitSkillCopyResult[] = []
  for (const destRel of CHECK_RUNNING_LOOPS_PROJECT_DESTS) {
    const destRoot = path.join(repoRoot, destRel)
    const destSkill = path.join(destRoot, 'SKILL.md')
    if (fs.existsSync(destSkill) && !force) {
      results.push({ dest: destRoot, action: 'skipped' })
      continue
    }
    for (const rel of CHECK_RUNNING_LOOPS_FILES) {
      copySkillFile(path.join(srcRoot, rel), path.join(destRoot, rel))
    }
    results.push({ dest: destRoot, action: 'written' })
  }
  return results
}

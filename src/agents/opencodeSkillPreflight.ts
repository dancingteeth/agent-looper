import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const defaultSkillsRoot = (): string => path.join(os.homedir(), '.agents', 'skills')

function isDanglingSymlink(filePath: string): string | undefined {
  let st: fs.Stats
  try {
    st = fs.lstatSync(filePath)
  } catch {
    return undefined
  }
  if (!st.isSymbolicLink()) return undefined
  try {
    fs.statSync(filePath)
    return undefined
  } catch {
    let target = filePath
    try {
      target = fs.readlinkSync(filePath)
    } catch {
      // keep filePath
    }
    return `${filePath} -> ${target}`
  }
}

/** OpenCode loads ~/.agents/skills at session boot and aborts on ENOENT. */
export function listDanglingAgentSkillLinks(skillsRoot = defaultSkillsRoot()): string[] {
  if (!fs.existsSync(skillsRoot)) return []

  const dangling: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: skillsRoot, depth: 0 }]

  while (queue.length > 0) {
    const next = queue.pop()
    if (next === undefined) break
    const { dir, depth } = next
    if (depth > 3) continue

    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const broken = isDanglingSymlink(full)
      if (broken !== undefined) {
        dangling.push(broken)
        continue
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        queue.push({ dir: full, depth: depth + 1 })
      }
    }
  }

  return dangling.sort()
}

export function formatDanglingAgentSkillError(links: readonly string[]): string {
  return [
    'OpenCode will abort session boot: dangling skill symlink(s) under ~/.agents/skills (ENOENT → UnknownError).',
    ...links.map((link) => `  ${link}`),
    'Relink each SKILL.md to the current Cursor plugin cache, or `rm` the dangling link.',
  ].join('\n')
}

export function assertOpencodeAgentSkillsReadable(skillsRoot = defaultSkillsRoot()): void {
  const dangling = listDanglingAgentSkillLinks(skillsRoot)
  if (dangling.length === 0) return
  throw new Error(formatDanglingAgentSkillError(dangling))
}

export function opencodeDanglingSkillHint(message: string): string {
  if (!/ENOENT/i.test(message) || !/SKILL\.md/i.test(message)) return ''
  return (
    ' Dangling ~/.agents/skills/*/SKILL.md symlink? Relink to the current plugin cache or rm the link.'
  )
}

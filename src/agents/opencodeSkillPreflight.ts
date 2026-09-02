import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const defaultSkillsRoot = (): string => path.join(os.homedir(), '.agents', 'skills')

export type DanglingSkillLink = {
  linkPath: string
  target: string
}

export type SkillHealResult = {
  relinked: Array<{ linkPath: string; from: string; to: string }>
  removed: Array<{ linkPath: string; target: string }>
}

const PLUGIN_CACHE_NEEDLE = '/.cursor/plugins/cache/'

export function parsePluginCacheTarget(resolvedTarget: string): {
  pluginRoot: string
  oldHash: string
  restParts: string[]
} | undefined {
  const normalized = resolvedTarget.replace(/\\/g, '/')
  const at = normalized.lastIndexOf(PLUGIN_CACHE_NEEDLE)
  if (at < 0) return undefined
  const tail = normalized.slice(at + PLUGIN_CACHE_NEEDLE.length)
  const parts = tail.split('/').filter((part) => part.length > 0)
  const publisher = parts[0]
  const plugin = parts[1]
  const oldHash = parts[2]
  const restParts = parts.slice(3)
  if (
    publisher === undefined ||
    plugin === undefined ||
    oldHash === undefined ||
    restParts.length === 0
  ) {
    return undefined
  }
  if (!/^[0-9a-f]{7,40}$/i.test(oldHash)) return undefined
  return {
    pluginRoot: path.join(
      normalized.slice(0, at),
      '.cursor',
      'plugins',
      'cache',
      publisher,
      plugin,
    ),
    oldHash,
    restParts,
  }
}

/** Cursor plugin-cache SKILL.md whose hash folder rotated to a live sibling. */
export function findPluginCacheReplacement(resolvedTarget: string): string | undefined {
  const parsed = parsePluginCacheTarget(resolvedTarget)
  if (parsed === undefined) return undefined

  let names: string[]
  try {
    names = fs.readdirSync(parsed.pluginRoot)
  } catch {
    return undefined
  }

  const candidates: Array<{ filePath: string; mtimeMs: number }> = []
  for (const name of names) {
    if (name === parsed.oldHash) continue
    if (!/^[0-9a-f]{7,40}$/i.test(name)) continue
    const filePath = path.join(parsed.pluginRoot, name, ...parsed.restParts)
    try {
      const st = fs.statSync(filePath)
      if (!st.isFile() && !st.isDirectory()) continue
      candidates.push({
        filePath,
        mtimeMs: fs.statSync(path.join(parsed.pluginRoot, name)).mtimeMs,
      })
    } catch {
      continue
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return candidates[0]?.filePath
}

function readDanglingSymlink(filePath: string): DanglingSkillLink | undefined {
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
    return { linkPath: filePath, target }
  }
}

/** OpenCode loads ~/.agents/skills at session boot and aborts on ENOENT. */
export function listDanglingAgentSkillEntries(
  skillsRoot = defaultSkillsRoot(),
): DanglingSkillLink[] {
  if (!fs.existsSync(skillsRoot)) return []

  const dangling: DanglingSkillLink[] = []
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
      const broken = readDanglingSymlink(full)
      if (broken !== undefined) {
        dangling.push(broken)
        continue
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        queue.push({ dir: full, depth: depth + 1 })
      }
    }
  }

  return dangling.sort((a, b) => a.linkPath.localeCompare(b.linkPath))
}

export function listDanglingAgentSkillLinks(skillsRoot = defaultSkillsRoot()): string[] {
  return listDanglingAgentSkillEntries(skillsRoot).map(
    (entry) => `${entry.linkPath} -> ${entry.target}`,
  )
}

function resolveLinkTarget(linkPath: string, target: string): string {
  return path.resolve(path.dirname(linkPath), target)
}

function replaceSymlink(linkPath: string, newTarget: string): void {
  fs.unlinkSync(linkPath)
  fs.symlinkSync(newTarget, linkPath)
}

/**
 * Relink Cursor plugin-cache hash rotations; drop anything still unreadable so
 * OpenCode can create a session instead of dying on ENOENT.
 */
export function repairOpencodeAgentSkills(
  skillsRoot = defaultSkillsRoot(),
): SkillHealResult {
  const result: SkillHealResult = { relinked: [], removed: [] }

  for (const entry of listDanglingAgentSkillEntries(skillsRoot)) {
    const resolved = resolveLinkTarget(entry.linkPath, entry.target)
    const replacement = findPluginCacheReplacement(resolved)
    if (replacement !== undefined) {
      try {
        replaceSymlink(entry.linkPath, replacement)
        result.relinked.push({
          linkPath: entry.linkPath,
          from: entry.target,
          to: replacement,
        })
        continue
      } catch {
        // fall through to drop
      }
    }
    try {
      fs.unlinkSync(entry.linkPath)
      result.removed.push({ linkPath: entry.linkPath, target: entry.target })
    } catch {
      // leftover is reported by assert
    }
  }

  return result
}

export function formatDanglingAgentSkillError(links: readonly string[]): string {
  return [
    'OpenCode will abort session boot: dangling skill symlink(s) under ~/.agents/skills (ENOENT → UnknownError).',
    ...links.map((link) => `  ${link}`),
    'Could not auto-heal (permissions?). Relink to the current Cursor plugin cache, or `rm` the dangling link.',
  ].join('\n')
}

function logHeal(result: SkillHealResult): void {
  for (const entry of result.relinked) {
    console.error(`[agent-loop] relinked skill ${entry.linkPath} -> ${entry.to}`)
  }
  for (const entry of result.removed) {
    console.error(
      `[agent-loop] dropped dangling skill ${entry.linkPath} (was ${entry.target})`,
    )
  }
}

export function assertOpencodeAgentSkillsReadable(skillsRoot = defaultSkillsRoot()): void {
  const healed = repairOpencodeAgentSkills(skillsRoot)
  logHeal(healed)
  const dangling = listDanglingAgentSkillLinks(skillsRoot)
  if (dangling.length === 0) return
  throw new Error(formatDanglingAgentSkillError(dangling))
}

export function opencodeDanglingSkillHint(message: string): string {
  if (!/ENOENT/i.test(message) || !/SKILL\.md/i.test(message)) return ''
  return (
    ' Dangling ~/.agents/skills/*/SKILL.md symlink? Harness auto-heals Cursor plugin-cache hash rotations on the next OpenCode boot; rm the link if it is not a cache skill.'
  )
}

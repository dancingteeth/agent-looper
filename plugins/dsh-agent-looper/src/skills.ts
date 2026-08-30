import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type ParsedSkill = {
  name: string
  description: string
  content: string
  path: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/

function parseFrontmatterField(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!match) return undefined
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

export function parseSkillFile(filePath: string, raw: string): ParsedSkill | undefined {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return undefined

  const [, frontmatter, body] = match
  const name = parseFrontmatterField(frontmatter, 'name')
  const description = parseFrontmatterField(frontmatter, 'description')
  if (!name || !description) return undefined

  return {
    name,
    description,
    content: body.trimStart(),
    path: filePath,
  }
}

export function discoverSkills(skillsDir: string): ParsedSkill[] {
  if (!fs.existsSync(skillsDir)) return []

  const skills: ParsedSkill[] = []
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    const entryPath = path.join(skillsDir, entry.name)
    let stat: fs.Stats
    try {
      stat = fs.statSync(entryPath)
    } catch {
      continue
    }
    if (!stat.isDirectory()) continue

    const skillMd = path.join(entryPath, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue
    const parsed = parseSkillFile(skillMd, fs.readFileSync(skillMd, 'utf8'))
    if (parsed) skills.push(parsed)
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

export function resolveSkillsDir(configured: string, pluginRoot: string): string {
  if (path.isAbsolute(configured)) return configured
  return path.resolve(pluginRoot, configured)
}

export function resolveOverlaysDir(packageRoot: string): string {
  return path.join(packageRoot, 'overlays')
}

export function loadSkillOverlay(skillName: string, overlaysDir: string): string {
  const overlayPath = path.join(overlaysDir, `${skillName}.md`)
  if (!fs.existsSync(overlayPath)) return ''
  return `\n\n${fs.readFileSync(overlayPath, 'utf8').trimStart()}`
}

export function applySkillOverlays(skills: ParsedSkill[], overlaysDir: string): ParsedSkill[] {
  return skills.map((skill) => ({
    ...skill,
    content: skill.content + loadSkillOverlay(skill.name, overlaysDir),
  }))
}

export const pluginRoot = path.dirname(fileURLToPath(import.meta.url))

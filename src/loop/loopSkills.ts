import fs from 'node:fs'
import path from 'node:path'
import {
  SKILL_DISCLOSURE_INDEX,
  SKILL_DISCLOSURE_INLINE,
  type SkillDisclosure,
} from './loopExtensions.js'

const SKILL_PATH_IN_GOAL =
  /packages\/skills\/[a-z0-9-]+\/SKILL\.md/gi

const DEFAULT_MAX_SKILL_CHARS = 12_000
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/
const INDEX_DESC_MAX = 180

export type SkillIndexEntry = {
  relativePath: string
  name: string
  description: string
  missing: boolean
}

export function extractSkillPathsFromGoal(goal: string): string[] {
  const matches = goal.match(SKILL_PATH_IN_GOAL) ?? []
  return [...new Set(matches.map((match) => match.replace(/`/g, '')))]
}

export function resolveLoopSkillPaths(
  goal: string,
  explicitSkills: string[] | undefined,
): string[] {
  const merged = [...(explicitSkills ?? []), ...extractSkillPathsFromGoal(goal)]
  return [...new Set(merged.map((skill) => skill.trim()).filter(Boolean))]
}

function parseFrontmatterField(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  if (!match?.[1]) return undefined
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

function fallbackName(relativePath: string): string {
  const parent = path.basename(path.dirname(relativePath))
  if (parent && parent !== '.' && parent !== '/') return parent
  return path.basename(relativePath)
}

function fallbackDescription(body: string): string {
  const line =
    body
      .split('\n')
      .map((row) => row.trim())
      .find((row) => row.length > 0 && !row.startsWith('#') && row !== '---') ?? ''
  const clipped = line.replace(/^#+\s*/, '')
  if (clipped.length <= INDEX_DESC_MAX) return clipped || 'Read this SKILL.md when the work matches.'
  return `${clipped.slice(0, INDEX_DESC_MAX - 1)}…`
}

function cellText(value: string): string {
  return value.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim()
}

export function skillIndexEntryFromFile(
  relativePath: string,
  raw: string | undefined,
): SkillIndexEntry {
  if (raw === undefined) {
    return {
      relativePath,
      name: fallbackName(relativePath),
      description: 'missing on disk — Read the path if you can recover it',
      missing: true,
    }
  }

  const match = raw.match(FRONTMATTER_RE)
  const name = match?.[1]
    ? parseFrontmatterField(match[1], 'name')
    : undefined
  const description = match?.[1]
    ? parseFrontmatterField(match[1], 'description')
    : undefined
  const body = match?.[2] ?? raw

  return {
    relativePath,
    name: name || fallbackName(relativePath),
    description: description || fallbackDescription(body),
    missing: false,
  }
}

function loadIndexedSkillSection(entries: SkillIndexEntry[]): string {
  const rows = entries.map(
    (entry) =>
      `| ${cellText(entry.name)} | \`${entry.relativePath}\` | ${cellText(entry.description)} |`,
  )
  return [
    '## Skills (index)',
    '',
    'Full runbooks are **not** in this prompt. When a skill applies, **Read** its path on disk and follow that file.',
    '',
    '| Name | Path | When to load |',
    '| --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function loadInlinedSkillSection(
  repoRoot: string,
  relativePaths: string[],
  maxCharsPerSkill: number,
): string {
  const blocks: string[] = []
  for (const relativePath of relativePaths) {
    const skillPath = path.join(repoRoot, relativePath)
    if (!fs.existsSync(skillPath)) {
      blocks.push(`### ${relativePath}\n\n_(missing on disk — load manually)_`)
      continue
    }

    const raw = fs.readFileSync(skillPath, 'utf8').trim()
    const body =
      raw.length <= maxCharsPerSkill
        ? raw
        : `${raw.slice(0, maxCharsPerSkill)}\n\n…(truncated — read full file on disk)`
    blocks.push(`### ${relativePath}\n\n${body}`)
  }

  return `## Loaded skills (from GOAL / loop.json / plugins — follow these runbooks)\n\n${blocks.join('\n\n')}`
}

export function loadLoopSkillSection(
  repoRoot: string,
  relativePaths: string[],
  disclosure: SkillDisclosure = SKILL_DISCLOSURE_INDEX,
  maxCharsPerSkill = DEFAULT_MAX_SKILL_CHARS,
): string | undefined {
  if (relativePaths.length === 0) return undefined

  switch (disclosure) {
    case SKILL_DISCLOSURE_INDEX: {
      const entries = relativePaths.map((relativePath) => {
        const skillPath = path.join(repoRoot, relativePath)
        if (!fs.existsSync(skillPath)) {
          return skillIndexEntryFromFile(relativePath, undefined)
        }
        return skillIndexEntryFromFile(relativePath, fs.readFileSync(skillPath, 'utf8'))
      })
      return loadIndexedSkillSection(entries)
    }
    case SKILL_DISCLOSURE_INLINE:
      return loadInlinedSkillSection(repoRoot, relativePaths, maxCharsPerSkill)
    default: {
      const _exhaustive: never = disclosure
      return _exhaustive
    }
  }
}

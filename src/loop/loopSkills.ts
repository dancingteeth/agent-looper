import fs from 'node:fs'
import path from 'node:path'

const SKILL_PATH_IN_GOAL =
  /packages\/skills\/[a-z0-9-]+\/SKILL\.md/gi

const DEFAULT_MAX_SKILL_CHARS = 12_000

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

export function loadLoopSkillSection(
  repoRoot: string,
  relativePaths: string[],
  maxCharsPerSkill = DEFAULT_MAX_SKILL_CHARS,
): string | undefined {
  if (relativePaths.length === 0) return undefined

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

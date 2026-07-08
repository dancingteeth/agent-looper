import { describe, expect, it } from 'vitest'
import { extractSkillPathsFromGoal, resolveLoopSkillPaths } from './loopSkills.js'

describe('loopSkills', () => {
  it('extracts skill paths referenced in GOAL markdown', () => {
    const goal = `
Load \`packages/skills/publish-pipeline/SKILL.md\` and packages/skills/coding-standard/SKILL.md
`
    expect(extractSkillPathsFromGoal(goal)).toEqual([
      'packages/skills/publish-pipeline/SKILL.md',
      'packages/skills/coding-standard/SKILL.md',
    ])
  })

  it('merges explicit loop.json skills with GOAL references', () => {
    const paths = resolveLoopSkillPaths('see packages/skills/check-engine/SKILL.md', [
      'packages/skills/coding-standard/SKILL.md',
    ])
    expect(paths).toEqual([
      'packages/skills/coding-standard/SKILL.md',
      'packages/skills/check-engine/SKILL.md',
    ])
  })
})

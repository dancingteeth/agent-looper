import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractSkillPathsFromGoal,
  loadLoopSkillSection,
  resolveLoopSkillPaths,
  skillIndexEntryFromFile,
} from './loopSkills.js'
import { SKILL_DISCLOSURE_INDEX, SKILL_DISCLOSURE_INLINE } from './loopExtensions.js'

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

describe('skillIndexEntryFromFile', () => {
  it('reads name and description from SKILL.md frontmatter', () => {
    const raw = `---
name: design-loop
description: Freeze GOAL.md and verify.sh
tags:
  - loops
---

# Design a loop

Long body that must not appear in the index.
`
    const entry = skillIndexEntryFromFile('plugins/x/skills/design-loop/SKILL.md', raw)
    expect(entry.name).toBe('design-loop')
    expect(entry.description).toBe('Freeze GOAL.md and verify.sh')
    expect(entry.missing).toBe(false)
  })

  it('falls back when frontmatter is absent', () => {
    const entry = skillIndexEntryFromFile('docs/runbooks/SKILL.md', '# Title\n\nDo the thing.\n')
    expect(entry.name).toBe('runbooks')
    expect(entry.description).toBe('Do the thing.')
  })
})

describe('loadLoopSkillSection', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function writeSkill(body: string): { root: string; rel: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-skills-'))
    dirs.push(root)
    const rel = path.join('skills', 'demo', 'SKILL.md')
    fs.mkdirSync(path.join(root, 'skills', 'demo'), { recursive: true })
    fs.writeFileSync(path.join(root, rel), body, 'utf8')
    return { root, rel }
  }

  it('indexes name and path without the full body (default)', () => {
    const { root, rel } = writeSkill(`---
name: demo
description: Only when fixing widgets
---

SECRET_RUNBOOK_LINE_SHOULD_NOT_LEAK
`)
    const section = loadLoopSkillSection(root, [rel])
    expect(section).toContain('## Skills (index)')
    expect(section).toContain('demo')
    expect(section).toContain(rel)
    expect(section).toContain('Only when fixing widgets')
    expect(section).toContain('Read')
    expect(section).not.toContain('SECRET_RUNBOOK_LINE_SHOULD_NOT_LEAK')
  })

  it('inlines the full body when skillDisclosure is inline', () => {
    const { root, rel } = writeSkill(`---
name: demo
description: widgets
---

SECRET_RUNBOOK_LINE_SHOULD_NOT_LEAK
`)
    const section = loadLoopSkillSection(root, [rel], SKILL_DISCLOSURE_INLINE)
    expect(section).toContain('## Loaded skills')
    expect(section).toContain('SECRET_RUNBOOK_LINE_SHOULD_NOT_LEAK')
  })

  it('notes missing paths in the index', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-skills-'))
    dirs.push(root)
    const section = loadLoopSkillSection(root, ['skills/gone/SKILL.md'], SKILL_DISCLOSURE_INDEX)
    expect(section).toContain('missing on disk')
    expect(section).toContain('skills/gone/SKILL.md')
  })
})

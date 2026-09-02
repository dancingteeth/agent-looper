import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateGoalPreflight } from './loopPreflight.js'

const MINIMAL_OK = `# Task

## Goal
Fix the widget.

## Constraints
- Do not disable tests.

## Acceptance criteria
Success is determined only by the verifier in \`loop.json\`, not by your assessment.

## Out of scope
- Deploy to production
`

describe('validateGoalPreflight', () => {
  it('passes a well-formed GOAL.md', () => {
    const result = validateGoalPreflight(MINIMAL_OK)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('errors when acceptance criteria missing', () => {
    const result = validateGoalPreflight('# Goal\nFix things.\n\n## Constraints\nDo not cheat.')
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/acceptance criteria/i)
  })

  it('accepts markdown-backtick scoreboard exit `0` without an Acceptance heading', () => {
    const result = validateGoalPreflight(
      '## Goal\nShip the page.\n\n## Finish line\n| **Scoreboard** | `verify.sh` exit `0` |\n\n## Constraints\nStay in src.\n\n## Out of scope\nDeploy.\n',
    )
    expect(result.ok).toBe(true)
  })

  it('passes the visual GOAL template the scaffold agent is told to copy', () => {
    const visual = fs.readFileSync(
      new URL('../../templates/GOAL.visual.template.md', import.meta.url),
      'utf8',
    )
    const result = validateGoalPreflight(visual)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('warns on missing optional sections', () => {
    const result = validateGoalPreflight(
      '## Goal\nX\n\nSuccess is determined only by the verifier in loop.json.',
    )
    expect(result.ok).toBe(true)
    expect(result.warnings.some((w) => /out of scope/i.test(w))).toBe(true)
    expect(result.warnings.some((w) => /measurable verify/i.test(w))).toBe(true)
  })

  it('does not warn on measurable verify when verify.sh is referenced', () => {
    const result = validateGoalPreflight(
      `${MINIMAL_OK}\n\nChecks in verify.sh and VERIFY.skill.md.`,
    )
    expect(result.warnings.some((w) => /measurable verify/i.test(w))).toBe(false)
  })
})

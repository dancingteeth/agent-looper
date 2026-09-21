import { describe, expect, it } from 'vitest'
import { buildScaffoldPrompt, SCAFFOLD_SESSION_TIMEOUT_MS } from './promptScaffold.js'

describe('buildScaffoldPrompt', () => {
  it('tells the scaffold agent GOAL.md must pass harness acceptance-criteria preflight', () => {
    const prompt = buildScaffoldPrompt('.cursor/loops/toy', 'a visual museum')
    expect(prompt).toMatch(/## Acceptance criteria/)
    expect(prompt).toMatch(/harness preflight/)
    expect(prompt).toMatch(/loop directory, then STOP/)
    expect(prompt).toMatch(/do not shrink it into a toy/)
    expect(prompt).toMatch(/Loop over required titles/)
    expect(prompt).toMatch(/Do not run tsc, vitest, vite/)
    expect(prompt).toMatch(/Do not copy sibling loops/)
    expect(prompt).toContain('`.cursor/loops/toy/GOAL.md`')
    expect(prompt).not.toMatch(/GOAL\.visual\.template\.md/)
    expect(prompt).not.toMatch(/docs\/unknowns-preflight/)
  })

  it('caps the scaffold session well under the implement wall', () => {
    expect(SCAFFOLD_SESSION_TIMEOUT_MS).toBe(10 * 60 * 1000)
    expect(SCAFFOLD_SESSION_TIMEOUT_MS).toBeLessThan(45 * 60 * 1000)
  })
})

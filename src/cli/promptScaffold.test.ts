import { describe, expect, it } from 'vitest'
import { buildScaffoldPrompt } from './promptScaffold.js'

describe('buildScaffoldPrompt', () => {
  it('tells the scaffold agent GOAL.md must pass harness acceptance-criteria preflight', () => {
    const prompt = buildScaffoldPrompt('.cursor/loops/toy', 'a visual museum')
    expect(prompt).toMatch(/## Acceptance criteria/)
    expect(prompt).toMatch(/harness preflight/)
    expect(prompt).toMatch(/GOAL\.visual\.template\.md/)
    expect(prompt).toMatch(/loop \*\*judge\*\*/)
    expect(prompt).toMatch(/do not shrink the idea/)
    expect(prompt).toMatch(/Freeze lint/)
    expect(prompt).toMatch(/loop over required titles/)
  })
})

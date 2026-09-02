import { describe, expect, it } from 'vitest'
import { parsePromptArgs, promptUsage } from './promptArgs.js'

describe('agent-loop-prompt args', () => {
  it('lists Ink and freeze in --help', () => {
    const text = promptUsage()
    expect(text).toMatch(/agent-loop-prompt/)
    expect(text).toMatch(/--out/)
    expect(text).toMatch(/--plain/)
    expect(text).toMatch(/--no-run/)
    expect(text).toMatch(/--yes/)
    expect(text).toMatch(/judge/)
  })

  it('parses --out and flags', () => {
    const parsed = parsePromptArgs([
      '--out',
      '.cursor/loops/foo',
      '--prompt',
      'ship auth',
      '--plain',
      '--no-run',
      '--yes',
      '--repo-root',
      '/repo',
    ])
    expect(parsed.kind).toBe('prompt')
    if (parsed.kind !== 'prompt') return
    expect(parsed.options.outDir).toBe('.cursor/loops/foo')
    expect(parsed.options.prompt).toBe('ship auth')
    expect(parsed.options.plain).toBe(true)
    expect(parsed.options.noRun).toBe(true)
    expect(parsed.options.yes).toBe(true)
    expect(parsed.options.repoRoot).toBe('/repo')
  })

  it('errors when --out is missing', () => {
    expect(parsePromptArgs([]).kind).toBe('error')
  })

  it('ignores a pnpm extra-args -- separator', () => {
    const parsed = parsePromptArgs(['--', '--out', '.cursor/loops/foo'])
    expect(parsed.kind).toBe('prompt')
    if (parsed.kind !== 'prompt') return
    expect(parsed.options.outDir).toBe('.cursor/loops/foo')
  })
})

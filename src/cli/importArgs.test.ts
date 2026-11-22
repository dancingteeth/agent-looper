import { describe, expect, it } from 'vitest'
import { parseImportArgs } from './importArgs.js'

describe('parseImportArgs', () => {
  it('parses source and flags', () => {
    expect(parseImportArgs(['plans', '--out', 'loops', '--force', '--dry-run', '--repo-root', '/r'])).toEqual({
      kind: 'run',
      options: { source: 'plans', out: 'loops', repoRoot: '/r', force: true, dryRun: true },
    })
  })

  it('returns help, and errors on a missing source, extra positionals or unknown flags', () => {
    expect(parseImportArgs(['--help']).kind).toBe('help')
    expect(parseImportArgs([]).kind).toBe('error')
    expect(parseImportArgs(['a.md', 'b.md']).kind).toBe('error')
    expect(parseImportArgs(['a.md', '--nope'])).toMatchObject({ kind: 'error', message: expect.stringMatching(/Unknown option --nope/) })
    expect(parseImportArgs(['a.md', '--out'])).toMatchObject({ kind: 'error', message: '--out requires a directory' })
    expect(parseImportArgs(['a.md', '--repo-root'])).toMatchObject({ kind: 'error' })
  })
})

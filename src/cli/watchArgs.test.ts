import { describe, expect, it } from 'vitest'
import { parseWatchArgs, watchUsage, type WatchCliOptions } from './watchArgs.js'

function expectWatch(argv: string[]): WatchCliOptions {
  const result = parseWatchArgs(argv)
  if (result.kind !== 'watch') {
    throw new Error(`expected watch result, got ${result.kind}: ${JSON.stringify(result)}`)
  }
  return result.options
}

describe('parseWatchArgs', () => {
  it('parses a bare loop dir with defaults', () => {
    const options = expectWatch(['.cursor/loops/fix'])
    expect(options.loopDir).toBe('.cursor/loops/fix')
    expect(options.snapshot).toBe(false)
    expect(options.plain).toBe(false)
    expect(options.repoRoot).toBeUndefined()
  })

  it('parses --snapshot, --plain, and --repo-root', () => {
    const options = expectWatch([
      '.cursor/loops/fix',
      '--snapshot',
      '--plain',
      '--repo-root',
      '/tmp/repo',
    ])
    expect(options.snapshot).toBe(true)
    expect(options.plain).toBe(true)
    expect(options.repoRoot).toBe('/tmp/repo')
  })

  it('returns help for --help and -h', () => {
    for (const flag of ['--help', '-h']) {
      expect(parseWatchArgs([flag])).toEqual({ kind: 'help', text: watchUsage() })
    }
  })

  it('errors with usage when no loop dir is given', () => {
    expect(parseWatchArgs([])).toEqual({ kind: 'error', message: watchUsage() })
  })

  it('mentions watch, snapshot, and plain in the help text', () => {
    const text = watchUsage()
    expect(text).toMatch(/watch/)
    expect(text).toMatch(/--snapshot/)
    expect(text).toMatch(/--plain/)
  })
})

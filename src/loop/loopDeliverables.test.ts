import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loopConfigSchema } from './loopConfig.js'
import {
  buildDeliverableNudgeSection,
  isConfinedDeliverablePath,
  missingDeliverables,
} from './loopDeliverables.js'

describe('missingDeliverables', () => {
  it('returns missing paths in order and treats empty files as missing', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-deliverables-'))
    fs.mkdirSync(path.join(repoRoot, 'docs'), { recursive: true })
    fs.writeFileSync(path.join(repoRoot, 'docs/here.md'), 'content')
    fs.writeFileSync(path.join(repoRoot, 'empty.md'), '')

    expect(missingDeliverables(repoRoot, ['docs/here.md', 'docs/missing.md'])).toEqual([
      'docs/missing.md',
    ])
    expect(missingDeliverables(repoRoot, ['empty.md'])).toEqual(['empty.md'])
    expect(missingDeliverables(repoRoot, [])).toEqual([])
  })

  it('never reports (or nudges for) absolute paths or paths that leave the repo', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-deliverables-'))
    const outside = path.join(os.tmpdir(), 'loop-deliverables-outside-never.md')
    expect(
      missingDeliverables(repoRoot, [
        outside,
        '../escape.md',
        'docs/../../escape.md',
        'docs/inside.md',
      ]),
    ).toEqual(['docs/inside.md'])
  })
})

describe('isConfinedDeliverablePath', () => {
  it('accepts repo-relative paths and rejects absolute or escaping ones', () => {
    expect(isConfinedDeliverablePath('docs/out.md')).toBe(true)
    expect(isConfinedDeliverablePath('./docs/out.md')).toBe(true)
    expect(isConfinedDeliverablePath('docs/../out.md')).toBe(true)
    expect(isConfinedDeliverablePath('/etc/passwd')).toBe(false)
    expect(isConfinedDeliverablePath('C:\\temp\\out.md')).toBe(false)
    expect(isConfinedDeliverablePath('../out.md')).toBe(false)
    expect(isConfinedDeliverablePath('docs/../../out.md')).toBe(false)
    expect(isConfinedDeliverablePath('..\\out.md')).toBe(false)
    expect(isConfinedDeliverablePath('.')).toBe(false)
  })

  it('loop.json parse rejects deliverables outside the repo', () => {
    expect(() => loopConfigSchema.parse({ verify: 'true', deliverables: ['/tmp/x.md'] })).toThrow(
      /repo-relative/,
    )
    expect(() => loopConfigSchema.parse({ verify: 'true', deliverables: ['../x.md'] })).toThrow(
      /repo-relative/,
    )
    expect(loopConfigSchema.parse({ verify: 'true', deliverables: ['out/x.md'] }).deliverables).toEqual([
      'out/x.md',
    ])
  })
})

describe('buildDeliverableNudgeSection', () => {
  it('lists missing paths under the expected heading', () => {
    const section = buildDeliverableNudgeSection(['out/report.md'])
    expect(section).toContain('## Deliverables missing')
    expect(section).toContain('out/report.md')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDeliverableNudgeSection, missingDeliverables } from './loopDeliverables.js'

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
})

describe('buildDeliverableNudgeSection', () => {
  it('lists missing paths under the expected heading', () => {
    const section = buildDeliverableNudgeSection(['out/report.md'])
    expect(section).toContain('## Deliverables missing')
    expect(section).toContain('out/report.md')
  })
})

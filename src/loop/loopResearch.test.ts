import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  loadLoopResearchSection,
  RESEARCH_FILENAME,
  resolveLoopResearchRelativePath,
} from './loopResearch.js'

describe('resolveLoopResearchRelativePath', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  function tmpRepo(): { root: string; loopDir: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-research-'))
    dirs.push(root)
    const loopDir = path.join(root, '.cursor', 'loops', 'brownfield')
    fs.mkdirSync(loopDir, { recursive: true })
    return { root, loopDir }
  }

  it('returns undefined when no sibling RESEARCH.md and no explicit path', () => {
    const { root, loopDir } = tmpRepo()
    expect(resolveLoopResearchRelativePath(loopDir, root)).toBeUndefined()
  })

  it('discovers RESEARCH.md beside GOAL.md', () => {
    const { root, loopDir } = tmpRepo()
    fs.writeFileSync(path.join(loopDir, RESEARCH_FILENAME), '# map\n', 'utf8')
    expect(resolveLoopResearchRelativePath(loopDir, root)).toBe(
      '.cursor/loops/brownfield/RESEARCH.md',
    )
  })

  it('prefers an explicit path that exists in the loop dir', () => {
    const { root, loopDir } = tmpRepo()
    fs.writeFileSync(path.join(loopDir, 'notes.md'), '# map\n', 'utf8')
    expect(resolveLoopResearchRelativePath(loopDir, root, 'notes.md')).toBe(
      '.cursor/loops/brownfield/notes.md',
    )
  })
})

describe('loadLoopResearchSection', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('indexes the path without the full body', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-research-'))
    dirs.push(root)
    const rel = path.join('.cursor', 'loops', 'x', RESEARCH_FILENAME)
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    fs.writeFileSync(
      path.join(root, rel),
      '# Research\n\nFiles under src/parser.\n\nSECRET_MAP_LINE_SHOULD_NOT_LEAK\n',
      'utf8',
    )
    const section = loadLoopResearchSection(root, rel.split(path.sep).join('/'))
    expect(section).toContain('## Research (index)')
    expect(section).toContain('Read')
    expect(section).toContain('verify.sh')
    expect(section).toContain('.cursor/loops/x/RESEARCH.md')
    expect(section).toContain('Files under src/parser.')
    expect(section).not.toContain('SECRET_MAP_LINE_SHOULD_NOT_LEAK')
  })

  it('notes a missing explicit path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-research-'))
    dirs.push(root)
    const section = loadLoopResearchSection(root, '.cursor/loops/gone/RESEARCH.md')
    expect(section).toContain('missing on disk')
    expect(section).toContain('.cursor/loops/gone/RESEARCH.md')
  })
})

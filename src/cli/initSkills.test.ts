import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHECK_RUNNING_LOOPS_FILES,
  CHECK_RUNNING_LOOPS_PROJECT_DESTS,
  CHECK_RUNNING_LOOPS_REL,
  copyCheckRunningLoopsSkill,
} from './initSkills.js'

const packageRoot = path.resolve(import.meta.dirname, '../..')

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-init-skills-'))
}

describe('copyCheckRunningLoopsSkill', () => {
  it('copies SKILL.md and the heartbeat script into Cursor and agents skill dirs', () => {
    const root = tmpRepo()
    const results = copyCheckRunningLoopsSkill(root, packageRoot, false)
    expect(results).toEqual(
      CHECK_RUNNING_LOOPS_PROJECT_DESTS.map((destRel) => ({
        dest: path.join(root, destRel),
        action: 'written',
      })),
    )
    for (const destRel of CHECK_RUNNING_LOOPS_PROJECT_DESTS) {
      const destRoot = path.join(root, destRel)
      const skill = fs.readFileSync(path.join(destRoot, 'SKILL.md'), 'utf8')
      expect(skill).toContain('name: check-running-loops')
      const script = path.join(destRoot, 'scripts', 'check-running-loops.sh')
      expect(fs.existsSync(script)).toBe(true)
      expect(fs.statSync(script).mode & 0o111).toBeTruthy()
      expect(fs.existsSync(path.join(destRoot, 'check-running-loops.test.mjs'))).toBe(
        false,
      )
    }
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('skips existing dests unless force', () => {
    const root = tmpRepo()
    copyCheckRunningLoopsSkill(root, packageRoot, false)
    const marker = path.join(root, '.cursor', 'skills', 'check-running-loops', 'SKILL.md')
    fs.writeFileSync(marker, 'stale\n')
    const skipped = copyCheckRunningLoopsSkill(root, packageRoot, false)
    expect(skipped.every((row) => row.action === 'skipped')).toBe(true)
    expect(fs.readFileSync(marker, 'utf8')).toBe('stale\n')
    const forced = copyCheckRunningLoopsSkill(root, packageRoot, true)
    expect(forced.every((row) => row.action === 'written')).toBe(true)
    expect(fs.readFileSync(marker, 'utf8')).toContain('name: check-running-loops')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('throws when the packaged skill is missing', () => {
    const root = tmpRepo()
    const emptyPkg = tmpRepo()
    expect(() => copyCheckRunningLoopsSkill(root, emptyPkg, false)).toThrow(
      /Missing package skill file/,
    )
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(emptyPkg, { recursive: true, force: true })
  })
})

describe('packaged check-running-loops source', () => {
  it('exists next to this checkout (npm files + dist-manifest)', () => {
    const srcRoot = path.join(packageRoot, CHECK_RUNNING_LOOPS_REL)
    for (const rel of CHECK_RUNNING_LOOPS_FILES) {
      expect(fs.existsSync(path.join(srcRoot, rel)), rel).toBe(true)
    }
  })
})

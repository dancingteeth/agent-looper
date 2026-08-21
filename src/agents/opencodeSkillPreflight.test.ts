import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertOpencodeAgentSkillsReadable,
  listDanglingAgentSkillLinks,
  opencodeDanglingSkillHint,
} from './opencodeSkillPreflight.js'

describe('opencodeSkillPreflight', () => {
  it('lists dangling SKILL.md links and ignores live files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-skills-'))
    const liveDir = path.join(root, 'live')
    const deadDir = path.join(root, 'dead')
    fs.mkdirSync(liveDir)
    fs.mkdirSync(deadDir)
    const liveTarget = path.join(root, 'real.md')
    fs.writeFileSync(liveTarget, '# ok\n')
    fs.symlinkSync(liveTarget, path.join(liveDir, 'SKILL.md'))
    fs.symlinkSync(path.join(root, 'missing.md'), path.join(deadDir, 'SKILL.md'))

    const dangling = listDanglingAgentSkillLinks(root)
    expect(dangling).toHaveLength(1)
    expect(dangling[0]).toContain('dead/SKILL.md')
    expect(dangling[0]).toContain('missing.md')
  })

  it('throws a host-fixable error when a skill link is dangling', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-skills-'))
    const deadDir = path.join(root, 'dead')
    fs.mkdirSync(deadDir)
    fs.symlinkSync(path.join(root, 'gone.md'), path.join(deadDir, 'SKILL.md'))
    expect(() => assertOpencodeAgentSkillsReadable(root)).toThrow(/dangling skill symlink/)
  })

  it('hints on OpenCode ENOENT SKILL.md errors only', () => {
    expect(opencodeDanglingSkillHint('UnknownError')).toBe('')
    expect(opencodeDanglingSkillHint('ENOENT: no such file SKILL.md')).toMatch(/dangling/i)
  })
})

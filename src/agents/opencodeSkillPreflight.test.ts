import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertOpencodeAgentSkillsReadable,
  findPluginCacheReplacement,
  listDanglingAgentSkillLinks,
  opencodeDanglingSkillHint,
  repairOpencodeAgentSkills,
} from './opencodeSkillPreflight.js'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('opencodeSkillPreflight', () => {
  it('lists dangling SKILL.md links and ignores live files', () => {
    const root = tmp('agent-loop-skills-')
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

  it('relinks a Cursor plugin-cache SKILL.md to the live hash', () => {
    const home = tmp('agent-loop-cache-home-')
    const oldHash = 'b9ddc83c32972210b8a94d389130713e8eed346e'
    const newHash = '23a56e2dac2efd54788056db8eced26e371d7b5e'
    const pluginRoot = path.join(home, '.cursor', 'plugins', 'cache', 'cursor-public', 'cursor-team-kit')
    const rest = path.join('skills', 'thermo-nuclear-code-quality-review', 'SKILL.md')
    const oldTarget = path.join(pluginRoot, oldHash, rest)
    const newTarget = path.join(pluginRoot, newHash, rest)
    fs.mkdirSync(path.dirname(newTarget), { recursive: true })
    fs.writeFileSync(newTarget, '# live\n')
    fs.mkdirSync(path.dirname(oldTarget), { recursive: true })

    const skillsRoot = path.join(home, '.agents', 'skills')
    const skillDir = path.join(skillsRoot, 'thermo-nuclear-code-quality-review')
    fs.mkdirSync(skillDir, { recursive: true })
    const linkPath = path.join(skillDir, 'SKILL.md')
    fs.symlinkSync(oldTarget, linkPath)

    expect(findPluginCacheReplacement(oldTarget)).toBe(newTarget)
    const healed = repairOpencodeAgentSkills(skillsRoot)
    expect(healed.relinked).toHaveLength(1)
    expect(healed.removed).toHaveLength(0)
    expect(fs.readlinkSync(linkPath)).toBe(newTarget)
    expect(fs.readFileSync(linkPath, 'utf8')).toBe('# live\n')
  })

  it('drops a dangling skill link when no cache replacement exists', () => {
    const root = tmp('agent-loop-skills-drop-')
    const deadDir = path.join(root, 'dead')
    fs.mkdirSync(deadDir)
    const linkPath = path.join(deadDir, 'SKILL.md')
    fs.symlinkSync(path.join(root, 'gone.md'), linkPath)

    const healed = repairOpencodeAgentSkills(root)
    expect(healed.removed).toHaveLength(1)
    expect(fs.existsSync(linkPath)).toBe(false)
    expect(listDanglingAgentSkillLinks(root)).toEqual([])
  })

  it('does not throw after healing a dangling cache skill', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const home = tmp('agent-loop-skills-assert-')
    const oldHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const newHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const pluginRoot = path.join(home, '.cursor', 'plugins', 'cache', 'cursor-public', 'kit')
    const rest = path.join('skills', 'demo', 'SKILL.md')
    const oldTarget = path.join(pluginRoot, oldHash, rest)
    const newTarget = path.join(pluginRoot, newHash, rest)
    fs.mkdirSync(path.dirname(newTarget), { recursive: true })
    fs.writeFileSync(newTarget, '# ok\n')
    const skillsRoot = path.join(home, 'skills')
    fs.mkdirSync(skillsRoot, { recursive: true })
    fs.symlinkSync(oldTarget, path.join(skillsRoot, 'SKILL.md'))

    expect(() => assertOpencodeAgentSkillsReadable(skillsRoot)).not.toThrow()
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/relinked skill/)
  })

  it('hints on OpenCode ENOENT SKILL.md errors only', () => {
    expect(opencodeDanglingSkillHint('UnknownError')).toBe('')
    expect(opencodeDanglingSkillHint('ENOENT: no such file SKILL.md')).toMatch(/auto-heals/i)
  })
})

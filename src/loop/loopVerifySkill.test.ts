import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runOneShotAgentPrompt } from '../agents/oneShotAgentRun.js'
import {
  buildVerifySkillPrompt,
  parseVerifyResult,
  resolveVerifySkillPath,
  runVerifySkill,
} from './loopVerifySkill.js'
import { loopConfigSchema } from './loopConfig.js'
import { repoProfileSchema } from '../context/repoProfile.js'

vi.mock('../agents/oneShotAgentRun.js', () => ({
  runOneShotAgentPrompt: vi.fn(),
}))

const mockedOneShot = vi.mocked(runOneShotAgentPrompt)

describe('parseVerifyResult', () => {
  it('parses PASS footer', () => {
    expect(parseVerifyResult('checks ok\nVERIFY_RESULT: PASS')).toBe('PASS')
  })

  it('parses FAIL footer', () => {
    expect(parseVerifyResult('still broken\nVERIFY_RESULT: FAIL')).toBe('FAIL')
  })

  it('uses the last footer when multiple appear', () => {
    expect(parseVerifyResult('VERIFY_RESULT: FAIL\nretry\nVERIFY_RESULT: PASS')).toBe('PASS')
  })

  it('returns null when footer is missing', () => {
    expect(parseVerifyResult('looks good to me')).toBeNull()
  })
})

describe('resolveVerifySkillPath', () => {
  it('prefers loop dir over repo root for relative paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-'))
    const loopDir = path.join(root, 'loop')
    fs.mkdirSync(loopDir)
    const loopSkill = path.join(loopDir, 'VERIFY.skill.md')
    fs.writeFileSync(loopSkill, 'loop')
    fs.writeFileSync(path.join(root, 'VERIFY.skill.md'), 'root')

    expect(resolveVerifySkillPath('VERIFY.skill.md', loopDir, root)).toBe(loopSkill)
  })
})

describe('buildVerifySkillPrompt', () => {
  it('includes goal and skill body with footer instructions', () => {
    const prompt = buildVerifySkillPrompt('Goal text', 'Skill steps')
    expect(prompt).toContain('Goal text')
    expect(prompt).toContain('Skill steps')
    expect(prompt).toContain('VERIFY_RESULT: PASS')
    expect(prompt).toContain('VERIFY_RESULT: FAIL')
  })
})

describe('runVerifySkill', () => {
  beforeEach(() => {
    mockedOneShot.mockReset()
  })

  it('fails when agent reports FAIL without running shell verify', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-run-'))
    const loopDir = path.join(root, 'loop')
    fs.mkdirSync(loopDir)
    const skillPath = path.join(loopDir, 'VERIFY.skill.md')
    fs.writeFileSync(skillPath, '# verify skill')
    const marker = path.join(root, 'shell-ran.txt')

    const config = loopConfigSchema.parse({
      verify: `node -e "require('fs').writeFileSync('${marker.replace(/\\/g, '\\\\')}','1')"`,
      verifyMode: 'skill',
      verifySkill: 'VERIFY.skill.md',
    })

    const result = await runVerifySkill({
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({}) },
      loopDir,
      goal: 'Acceptance criteria',
      config,
      runAgent: async () => ({ text: 'nope\nVERIFY_RESULT: FAIL' }),
    })

    expect(result.complete).toBe(false)
    expect(result.reason).toContain('FAIL')
    expect(fs.existsSync(marker)).toBe(false)
  })

  it('runs shell verify after agent PASS', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-run-'))
    const loopDir = path.join(root, 'loop')
    fs.mkdirSync(loopDir)
    fs.writeFileSync(path.join(loopDir, 'VERIFY.skill.md'), '# verify skill')

    const config = loopConfigSchema.parse({
      verify: 'true',
      verifyMode: 'skill',
      verifySkill: 'VERIFY.skill.md',
    })

    const result = await runVerifySkill({
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({}) },
      loopDir,
      goal: 'Acceptance criteria',
      config,
      runAgent: async () => ({ text: 'all good\nVERIFY_RESULT: PASS' }),
    })

    expect(result.complete).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.command).toContain('skill:')
    expect(result.command).toContain('→ true')
  })

  it('fails when agent PASS but shell verify fails', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-run-'))
    const loopDir = path.join(root, 'loop')
    fs.mkdirSync(loopDir)
    fs.writeFileSync(path.join(loopDir, 'VERIFY.skill.md'), '# verify skill')

    const config = loopConfigSchema.parse({
      verify: 'false',
      verifyMode: 'skill',
      verifySkill: 'VERIFY.skill.md',
    })

    const result = await runVerifySkill({
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({}) },
      loopDir,
      goal: 'Acceptance criteria',
      config,
      runAgent: async () => ({ text: 'VERIFY_RESULT: PASS' }),
    })

    expect(result.complete).toBe(false)
    expect(result.reason).toContain('exit 1')
  })

  it('uses the iteration reasoning ladder when no runAgent override is provided', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-skill-run-'))
    const loopDir = path.join(root, 'loop')
    fs.mkdirSync(loopDir)
    fs.writeFileSync(path.join(loopDir, 'VERIFY.skill.md'), '# verify skill')
    mockedOneShot.mockResolvedValue({ text: 'ok\nVERIFY_RESULT: PASS' })

    const config = loopConfigSchema.parse({
      verify: 'true',
      verifyMode: 'skill',
      verifySkill: 'VERIFY.skill.md',
      runtime: 'pi',
      reasoningEffort: 'medium',
      escalateReasoningEffort: 'xhigh',
    })

    const result = await runVerifySkill({
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({}) },
      loopDir,
      goal: 'Acceptance criteria',
      config,
      iteration: 3,
    })

    expect(result.complete).toBe(true)
    expect(mockedOneShot).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      expect.objectContaining({ runtime: 'pi', reasoningEffort: 'xhigh' }),
      expect.objectContaining({ phase: 'verify' }),
    )
  })
})

describe('loopConfigSchema verifyMode', () => {
  it('defaults verifyMode to command', () => {
    expect(loopConfigSchema.parse({ verify: 'true' }).verifyMode).toBe('command')
  })

  it('requires verifySkill when verifyMode is skill', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        verifyMode: 'skill',
      }),
    ).toThrow(/verifySkill/)
  })

  it('accepts skill mode with verifySkill', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      verifyMode: 'skill',
      verifySkill: '.cursor/loops/example/VERIFY.skill.md',
    })
    expect(parsed.verifyMode).toBe('skill')
    expect(parsed.verifySkill).toContain('VERIFY.skill.md')
  })
})

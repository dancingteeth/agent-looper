import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildStallProbePromptSection,
  createGitWorkspacePort,
  pickStallProbeWinner,
  STALL_PROBE_VARIANTS,
} from './loopStallProbes.js'
import type { VerifyResult } from './loopVerify.js'

const VERIFY_CMD = 'bash verify.sh'

function fail(stdout = 'FAIL same'): VerifyResult {
  return {
    complete: false,
    command: VERIFY_CMD,
    exitCode: 1,
    stdout,
    stderr: '',
    reason: 'fail',
  }
}

function pass(): VerifyResult {
  return {
    complete: true,
    command: VERIFY_CMD,
    exitCode: 0,
    stdout: 'ok',
    stderr: '',
    reason: 'ok',
  }
}

describe('loopStallProbes', () => {
  it('exports two variants', () => {
    expect([...STALL_PROBE_VARIANTS]).toEqual(['procedure', 'facts'])
  })

  it('builds distinct prompt sections', () => {
    const input = {
      verifyCommand: VERIFY_CMD,
      lastVerify: fail('\nFAIL line one\nmore'),
      diffStat: ' file.ts | 1 +',
    }
    const procedure = buildStallProbePromptSection('procedure', input)
    const facts = buildStallProbePromptSection('facts', input)
    expect(procedure).toContain('## Stall probe: procedure hints')
    expect(facts).toContain('## Stall probe: repo facts')
    expect(procedure).not.toContain('repo facts')
    expect(facts).toContain('FAIL line one')
    expect(facts).toContain(VERIFY_CMD)
  })

  it('createGitWorkspacePort restores tracked and untracked without stash or HEAD move', async () => {
    function sh(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, { cwd, encoding: 'utf8' })
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-git-'))
    sh(dir, 'init', '-q')
    sh(dir, 'config', 'user.email', 'test@example.com')
    sh(dir, 'config', 'user.name', 'test')
    fs.writeFileSync(path.join(dir, '.gitignore'), 'ignored.log\n')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'v1\n')
    sh(dir, 'add', '.')
    sh(dir, 'commit', '-qm', 'init')
    const head = sh(dir, 'rev-parse', 'HEAD').trim()

    fs.writeFileSync(path.join(dir, 'a.txt'), 'v2\n')
    fs.writeFileSync(path.join(dir, 'b.txt'), 'new\n')
    const port = createGitWorkspacePort(dir)
    const snap = await port.snapshot()

    fs.writeFileSync(path.join(dir, 'a.txt'), 'v3\n')
    fs.rmSync(path.join(dir, 'b.txt'))
    fs.writeFileSync(path.join(dir, 'c.txt'), 'probe junk\n')
    fs.writeFileSync(path.join(dir, 'ignored.log'), 'keep me\n')
    await port.restore(snap)

    expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('v2\n')
    expect(fs.readFileSync(path.join(dir, 'b.txt'), 'utf8')).toBe('new\n')
    expect(fs.existsSync(path.join(dir, 'c.txt'))).toBe(false)
    expect(fs.readFileSync(path.join(dir, 'ignored.log'), 'utf8')).toBe('keep me\n')
    expect(sh(dir, 'rev-parse', 'HEAD').trim()).toBe(head)
    expect(sh(dir, 'stash', 'list').trim()).toBe('')
  })

  it('pickStallProbeWinner prefers green, then moved fingerprint', () => {
    const stalled = fail()
    const moved = fail('FAIL different')
    expect(
      pickStallProbeWinner(stalled, [
        { variant: 'procedure', verify: stalled },
        { variant: 'facts', verify: pass() },
      ]),
    ).toBe('facts')
    expect(
      pickStallProbeWinner(stalled, [
        { variant: 'procedure', verify: moved },
        { variant: 'facts', verify: stalled },
      ]),
    ).toBe('procedure')
    expect(
      pickStallProbeWinner(stalled, [
        { variant: 'procedure', verify: stalled },
        { variant: 'facts', verify: stalled },
      ]),
    ).toBeUndefined()
  })
})

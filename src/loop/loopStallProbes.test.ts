import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('createGitWorkspacePort preserves binary bytes and tracked deletions', async () => {
    function sh(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, { cwd, encoding: 'utf8' })
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-bin-'))
    sh(dir, 'init', '-q')
    sh(dir, 'config', 'user.email', 'test@example.com')
    sh(dir, 'config', 'user.name', 'test')
    const bin = Buffer.from([0x00, 0xff, 0x80])
    fs.writeFileSync(path.join(dir, 'bin.dat'), bin)
    sh(dir, 'add', 'bin.dat')
    sh(dir, 'commit', '-qm', 'init')

    fs.writeFileSync(path.join(dir, 'bin.dat'), Buffer.from([0xde, 0xad]))
    const port = createGitWorkspacePort(dir)
    const snap = await port.snapshot()

    fs.writeFileSync(path.join(dir, 'bin.dat'), 'text')
    await port.restore(snap)
    expect(fs.readFileSync(path.join(dir, 'bin.dat'))).toEqual(Buffer.from([0xde, 0xad]))

    fs.rmSync(path.join(dir, 'bin.dat'))
    const snapDeleted = await port.snapshot()
    fs.writeFileSync(path.join(dir, 'bin.dat'), 'back')
    await port.restore(snapDeleted)
    expect(fs.existsSync(path.join(dir, 'bin.dat'))).toBe(false)
  })

  it('createGitWorkspacePort resets index state from the snapshot', async () => {
    function sh(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, { cwd, encoding: 'utf8' })
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-index-'))
    sh(dir, 'init', '-q')
    sh(dir, 'config', 'user.email', 'test@example.com')
    sh(dir, 'config', 'user.name', 'test')
    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'v1\n')
    sh(dir, 'add', 'tracked.txt')
    sh(dir, 'commit', '-qm', 'init')

    fs.writeFileSync(path.join(dir, 'tracked.txt'), 'dirty\n')
    fs.writeFileSync(path.join(dir, 'staged-new.txt'), 'new\n')
    sh(dir, 'add', 'staged-new.txt')
    const port = createGitWorkspacePort(dir)
    const snap = await port.snapshot()

    fs.rmSync(path.join(dir, 'tracked.txt'))
    fs.writeFileSync(path.join(dir, 'probe-only.txt'), 'probe\n')
    sh(dir, 'add', 'probe-only.txt')
    await port.restore(snap)

    expect(fs.readFileSync(path.join(dir, 'tracked.txt'), 'utf8')).toBe('dirty\n')
    expect(fs.readFileSync(path.join(dir, 'staged-new.txt'), 'utf8')).toBe('new\n')
    expect(fs.existsSync(path.join(dir, 'probe-only.txt'))).toBe(false)
    // The snapshot's staging comes back exactly: staged-new.txt is still staged, the
    // probe's staged add is gone.
    expect(sh(dir, 'diff', '--cached', '--name-only').trim()).toBe('staged-new.txt')
  })

  it('createGitWorkspacePort does not delete untracked files under .cursor/loops', async () => {
    function sh(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, { cwd, encoding: 'utf8' })
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-bundle-'))
    sh(dir, 'init', '-q')
    sh(dir, 'config', 'user.email', 'test@example.com')
    sh(dir, 'config', 'user.name', 'test')
    sh(dir, 'commit', '--allow-empty', '-qm', 'init')
    const port = createGitWorkspacePort(dir)
    const snap = await port.snapshot()

    const notes = path.join(dir, '.cursor/loops/stall-probes/notes.md')
    fs.mkdirSync(path.dirname(notes), { recursive: true })
    fs.writeFileSync(notes, 'scratch\n')
    fs.writeFileSync(path.join(dir, 'probe-junk.txt'), 'remove me\n')
    await port.restore(snap)

    expect(fs.readFileSync(notes, 'utf8')).toBe('scratch\n')
    expect(fs.existsSync(path.join(dir, 'probe-junk.txt'))).toBe(false)
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

  describe('createGitWorkspacePort guard cases (stall-probes review)', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })
    function sh(cwd: string, ...args: string[]): string {
      return execFileSync('git', args, { cwd, encoding: 'utf8' })
    }
    function repo(): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-guard-'))
      sh(dir, 'init', '-q')
      sh(dir, 'config', 'user.email', 'test@example.com')
      sh(dir, 'config', 'user.name', 'test')
      return dir
    }

    it('handles paths porcelain would quote (spaces, unicode)', async () => {
      const dir = repo()
      fs.writeFileSync(path.join(dir, 'my file.txt'), 'v1\n')
      sh(dir, 'add', '.')
      sh(dir, 'commit', '-qm', 'init')
      fs.writeFileSync(path.join(dir, 'my file.txt'), 'dirty\n')
      fs.mkdirSync(path.join(dir, 'notes'))
      fs.writeFileSync(path.join(dir, 'notes', 'my note ü.txt'), 'keep\n')
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      fs.writeFileSync(path.join(dir, 'my file.txt'), 'probe\n')
      fs.rmSync(path.join(dir, 'notes', 'my note ü.txt'))
      fs.writeFileSync(path.join(dir, 'junk file.txt'), 'x\n')
      await port.restore(snap)

      expect(fs.readFileSync(path.join(dir, 'my file.txt'), 'utf8')).toBe('dirty\n')
      expect(fs.readFileSync(path.join(dir, 'notes', 'my note ü.txt'), 'utf8')).toBe('keep\n')
      expect(fs.existsSync(path.join(dir, 'junk file.txt'))).toBe(false)
    })

    it('never writes through a symlink to a file outside the repo', async () => {
      const dir = repo()
      sh(dir, 'commit', '--allow-empty', '-qm', 'init')
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stall-probes-outside-'))
      const outside = path.join(outsideDir, 'target.txt')
      fs.writeFileSync(outside, 'original\n')
      fs.symlinkSync(outside, path.join(dir, 'link.txt'))
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      // The outside file changes on its own; the probe replaces the link with a file.
      fs.writeFileSync(outside, 'changed outside\n')
      fs.unlinkSync(path.join(dir, 'link.txt'))
      fs.writeFileSync(path.join(dir, 'link.txt'), 'probe wrote a regular file\n')
      await port.restore(snap)

      expect(fs.readFileSync(outside, 'utf8')).toBe('changed outside\n')
      expect(fs.lstatSync(path.join(dir, 'link.txt')).isSymbolicLink()).toBe(true)
      expect(fs.readlinkSync(path.join(dir, 'link.txt'))).toBe(outside)

      // A probe that turns a snapshot file into a link to the outside: restore replaces
      // the link itself and leaves the outside target alone.
      fs.writeFileSync(path.join(dir, 'plain.txt'), 'snap\n')
      const snap2 = await port.snapshot()
      fs.rmSync(path.join(dir, 'plain.txt'))
      fs.symlinkSync(outside, path.join(dir, 'plain.txt'))
      await port.restore(snap2)
      expect(fs.lstatSync(path.join(dir, 'plain.txt')).isSymbolicLink()).toBe(false)
      expect(fs.readFileSync(path.join(dir, 'plain.txt'), 'utf8')).toBe('snap\n')
      expect(fs.readFileSync(outside, 'utf8')).toBe('changed outside\n')
    })

    it('restores a staged rename as a rename (not a copy)', async () => {
      const dir = repo()
      fs.writeFileSync(path.join(dir, 'old.ts'), 'export const x = 1\n')
      sh(dir, 'add', '.')
      sh(dir, 'commit', '-qm', 'init')
      sh(dir, 'mv', 'old.ts', 'new.ts')
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      sh(dir, 'mv', 'new.ts', 'other.ts')
      fs.writeFileSync(path.join(dir, 'old.ts'), 'probe recreated\n')
      await port.restore(snap)

      expect(fs.existsSync(path.join(dir, 'old.ts'))).toBe(false)
      expect(fs.existsSync(path.join(dir, 'other.ts'))).toBe(false)
      expect(fs.readFileSync(path.join(dir, 'new.ts'), 'utf8')).toBe('export const x = 1\n')
      expect(sh(dir, 'diff', '--cached', '--name-status', '-M').trim()).toMatch(/^R\d*\s+old\.ts\s+new\.ts$/)
    })

    it('keeps the executable bit on a recreated 0755 file', async () => {
      const dir = repo()
      sh(dir, 'commit', '--allow-empty', '-qm', 'init')
      const script = path.join(dir, 'run.sh')
      fs.writeFileSync(script, '#!/bin/sh\necho hi\n', { mode: 0o755 })
      fs.chmodSync(script, 0o755)
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      fs.rmSync(script)
      await port.restore(snap)
      expect(fs.statSync(script).mode & 0o777).toBe(0o755)

      fs.chmodSync(script, 0o644)
      await port.restore(snap)
      expect(fs.statSync(script).mode & 0o777).toBe(0o755)
    })

    it('keeps a new file a probe staged under .cursor/loops on disk', async () => {
      const dir = repo()
      sh(dir, 'commit', '--allow-empty', '-qm', 'init')
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      const notes = path.join(dir, '.cursor/loops/stall-probes/notes.md')
      fs.mkdirSync(path.dirname(notes), { recursive: true })
      fs.writeFileSync(notes, 'scratch\n')
      sh(dir, 'add', '.cursor/loops/stall-probes/notes.md')
      await port.restore(snap)

      expect(fs.readFileSync(notes, 'utf8')).toBe('scratch\n')
      // The index is the snapshot's again (the probe's staging is undone).
      expect(sh(dir, 'diff', '--cached', '--name-only').trim()).toBe('')
    })

    it('undoes a probe commit (soft) and refuses to restore onto an unrelated HEAD', async () => {
      const dir = repo()
      fs.writeFileSync(path.join(dir, 'a.txt'), 'v1\n')
      sh(dir, 'add', '.')
      sh(dir, 'commit', '-qm', 'init')
      const head = sh(dir, 'rev-parse', 'HEAD').trim()
      fs.writeFileSync(path.join(dir, 'a.txt'), 'dirty\n')
      const port = createGitWorkspacePort(dir)
      const snap = await port.snapshot()

      fs.writeFileSync(path.join(dir, 'a.txt'), 'probe\n')
      sh(dir, 'commit', '-qam', 'probe commit')
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await port.restore(snap)
      expect(sh(dir, 'rev-parse', 'HEAD').trim()).toBe(head)
      expect(fs.readFileSync(path.join(dir, 'a.txt'), 'utf8')).toBe('dirty\n')

      sh(dir, 'checkout', '-q', '--orphan', 'elsewhere')
      sh(dir, 'commit', '-qm', 'unrelated')
      expect(() => port.restore(snap)).toThrow(/HEAD moved/)
    })

    it('leaves the worktree, index, refs and stash untouched when taking a snapshot', async () => {
      const dir = repo()
      fs.writeFileSync(path.join(dir, 'a.txt'), 'v1\n')
      sh(dir, 'add', '.')
      sh(dir, 'commit', '-qm', 'init')
      fs.writeFileSync(path.join(dir, 'a.txt'), 'dirty\n')
      fs.writeFileSync(path.join(dir, 'b.txt'), 'staged\n')
      sh(dir, 'add', 'b.txt')
      const before = sh(dir, 'status', '--porcelain=v1', '-z')
      await createGitWorkspacePort(dir).snapshot()
      expect(sh(dir, 'status', '--porcelain=v1', '-z')).toBe(before)
      expect(sh(dir, 'stash', 'list').trim()).toBe('')
    })
  })
})

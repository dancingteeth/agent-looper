import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: vi.fn(actual.execFileSync),
  }
})

import { captureGitWorkspaceSnapshot } from './loopGit.js'

const mockedExecFileSync = vi.mocked(execFileSync)

describe('captureGitWorkspaceSnapshot', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    mockedExecFileSync.mockImplementation(actual.execFileSync)
  })

  it('captures branch and short sha in a git checkout', () => {
    const snap = captureGitWorkspaceSnapshot(process.cwd())
    expect(snap.branch).toBeTruthy()
    expect(snap.shortSha).toMatch(/^[0-9a-f]+$/i)
    expect(snap.diffStat).toBeTruthy()
    expect(snap.statusPorcelain).toBeTruthy()
  })

  it('returns unknown snapshot when git is unavailable', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('git missing')
    })

    const snap = captureGitWorkspaceSnapshot(process.cwd())
    expect(snap).toEqual({
      branch: '(unknown)',
      shortSha: '(unknown)',
      diffStat: '(git unavailable)',
      statusPorcelain: '(git unavailable)',
    })
  })

  it('uses (detached) label when git returns an empty branch name', () => {
    mockedExecFileSync.mockImplementation((_cmd, args) => {
      const sub = (args as string[])[0]
      if (sub === 'branch') return ''
      if (sub === 'rev-parse') return 'abc1234'
      if (sub === 'diff') return ''
      if (sub === 'status') return ''
      return ''
    })

    const snap = captureGitWorkspaceSnapshot(process.cwd())
    expect(snap.branch).toBe('(detached)')
    expect(snap.shortSha).toBe('abc1234')
  })

  it('falls back to placeholder strings for empty git output', () => {
    mockedExecFileSync.mockImplementation((_cmd, args) => {
      const sub = (args as string[])[0]
      if (sub === 'branch') return 'main'
      if (sub === 'rev-parse') return 'deadbeef'
      if (sub === 'diff') return ''
      if (sub === 'status') return ''
      return ''
    })

    const snap = captureGitWorkspaceSnapshot(process.cwd())
    expect(snap.diffStat).toBe('(no unstaged diff)')
    expect(snap.statusPorcelain).toBe('(clean)')
  })
})

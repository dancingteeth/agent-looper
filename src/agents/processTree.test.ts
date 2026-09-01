import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectDescendantPids,
  killProcessGroup,
  killProcessTree,
  PARENT_DEATH_REAPER_SCRIPT,
  shouldInstallProcessSignalHandlers,
  signalProcessTree,
  spawnParentDeathReaper,
  trackSpawnedRoot,
  trackedSpawnedRoots,
  type ProcessTreeIo,
} from './processTree.js'

describe('collectDescendantPids', () => {
  it('walks pgrep-style children without including the root', () => {
    const children: Record<number, number[]> = {
      10: [11, 12],
      11: [13],
      12: [],
      13: [],
    }
    expect(collectDescendantPids(10, (pid) => children[pid] ?? [])).toEqual([11, 12, 13])
  })
})

describe('killProcessGroup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signals the process-group leader as -pid', () => {
    const seen: number[] = []
    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      seen.push(pid)
      return true
    }) as typeof process.kill)
    killProcessGroup(4242, 'SIGTERM')
    expect(seen[0]).toBe(-4242)
  })

  it('falls back to the raw pid when group kill fails', () => {
    const seen: number[] = []
    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid < 0) throw new Error('ESRCH')
      seen.push(pid)
      return true
    }) as typeof process.kill)
    killProcessGroup(7, 'SIGKILL')
    expect(seen).toEqual([7])
  })
})

describe('signalProcessTree', () => {
  it('SIGTERMs descendants before the root', () => {
    const children: Record<number, number[]> = { 1: [2], 2: [3], 3: [] }
    const seen: Array<[number, NodeJS.Signals]> = []
    const io: ProcessTreeIo = {
      listChildren: (pid) => children[pid] ?? [],
      kill: (pid, signal) => {
        seen.push([pid, signal])
      },
      alive: () => false,
    }
    signalProcessTree(1, 'SIGTERM', io)
    expect(seen.map(([pid]) => pid)).toEqual([3, 2, 1])
  })
})

describe('killProcessTree', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('SIGKILLs pids still alive after grace', async () => {
    vi.spyOn(process, 'kill').mockImplementation((() => true) as typeof process.kill)
    const children: Record<number, number[]> = { 8: [9], 9: [] }
    const alive = new Set([8, 9])
    const seen: Array<[number, NodeJS.Signals]> = []
    const io: ProcessTreeIo = {
      listChildren: (pid) => children[pid] ?? [],
      kill: (pid, signal) => {
        seen.push([pid, signal])
        if (signal === 'SIGKILL') alive.delete(pid)
      },
      alive: (pid) => alive.has(pid),
    }
    await killProcessTree(8, {
      graceMs: 10,
      io,
      delay: async () => undefined,
    })
    expect(seen.some((row) => row[0] === 9 && row[1] === 'SIGTERM')).toBe(true)
    expect(seen.some((row) => row[0] === 8 && row[1] === 'SIGKILL')).toBe(true)
  })
})

describe('trackSpawnedRoot', () => {
  it('untracks after dispose callback', () => {
    const untrack = trackSpawnedRoot(99)
    expect(trackedSpawnedRoots()).toContain(99)
    untrack()
    expect(trackedSpawnedRoots()).not.toContain(99)
  })
})

describe('shouldInstallProcessSignalHandlers', () => {
  it('stays off under vitest', () => {
    expect(shouldInstallProcessSignalHandlers({ VITEST: 'true' })).toBe(false)
    expect(shouldInstallProcessSignalHandlers({})).toBe(true)
  })
})

describe('parent-death reaper', () => {
  it('watches the harness pid then kills the serve tree', () => {
    expect(PARENT_DEATH_REAPER_SCRIPT).toContain('kill -0 "$parent"')
    expect(PARENT_DEATH_REAPER_SCRIPT).toContain('pgrep -P')
    expect(PARENT_DEATH_REAPER_SCRIPT).toContain('kill -TERM')
    expect(PARENT_DEATH_REAPER_SCRIPT).toContain('kill -KILL')
  })

  it('no-ops when root pid is missing', () => {
    const reaper = spawnParentDeathReaper({ parentPid: process.pid, rootPid: 0 })
    expect(reaper.pid).toBeUndefined()
    reaper.close()
  })
})

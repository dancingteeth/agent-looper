import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectDescendantPids,
  killProcessGroup,
  killProcessTree,
  newlySpawnedPids,
  PARENT_DEATH_REAPER_SCRIPT,
  shouldInstallProcessSignalHandlers,
  signalProcessTree,
  spawnParentDeathReaper,
  trackSpawnedRoot,
  trackedSpawnedRoots,
  watchSpawnedChildren,
  withSpawnedChildrenPoll,
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

describe('newlySpawnedPids', () => {
  it('returns children missing from the snapshot', () => {
    expect(newlySpawnedPids([1, 2], 10, (pid) => (pid === 10 ? [2, 3] : []))).toEqual([3])
  })
})

describe('watchSpawnedChildren', () => {
  it('tracks new children, skips reaper pids, and kills the tree on release', async () => {
    let children = [11, 12]
    const tracked: number[] = []
    const killed: number[] = []
    const reaperClosed: number[] = []
    const watch = watchSpawnedChildren([10], {
      parentPid: 1,
      listChildren: () => children,
      track: (pid) => {
        if (pid !== undefined) tracked.push(pid)
        return () => undefined
      },
      spawnReaper: ({ rootPid }) => {
        const reaperPid = rootPid === 11 ? 99 : 100
        return {
          pid: reaperPid,
          close: () => {
            reaperClosed.push(rootPid)
          },
        }
      },
      killTree: async (pid) => {
        killed.push(pid ?? 0)
      },
    })
    expect(watch.pids).toEqual([11, 12])
    children = [11, 12, 99, 13]
    watch.adopt()
    expect(watch.pids).toEqual([11, 12, 13])
    await watch.release()
    expect(reaperClosed).toEqual([11, 12, 13])
    expect(killed).toEqual([11, 12, 13])
    await watch.release()
    expect(killed).toEqual([11, 12, 13])
  })
})

describe('withSpawnedChildrenPoll', () => {
  it('adopts before and after work', async () => {
    const adopt = vi.fn()
    const result = await withSpawnedChildrenPoll(
      { pids: [], adopt, release: async () => undefined },
      async () => 'ok',
      10_000,
    )
    expect(result).toBe('ok')
    expect(adopt.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: vi.fn(actual.execFileSync),
  }
})

import {
  createHitlCheckTask,
  markTaskwarriorDoneByUuid,
  runTaskwarriorSync,
} from './taskwarrior.js'

const mockedExecFileSync = vi.mocked(execFileSync)

describe('createHitlCheckTask', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset()
  })

  it('adds a task and returns the looked-up UUID', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync
      .mockReturnValueOnce('') // task add
      .mockReturnValueOnce('a74a94d1-2069-4e05-861e-de80143b0526\n') // _uuid

    const uuid = createHitlCheckTask('check checkout', 'zwook')
    expect(uuid).toBe('a74a94d1-2069-4e05-861e-de80143b0526')
    expect(mockedExecFileSync).toHaveBeenNthCalledWith(
      1,
      'task',
      ['add', 'project:zwook', '+hitl', '+manual', 'HITL Check: check checkout'],
      expect.objectContaining({ encoding: 'utf8' }),
    )
    expect(mockedExecFileSync.mock.calls[1]?.[1]).toEqual(
      expect.arrayContaining([
        'project:zwook',
        '+hitl',
        '+manual',
        'status:pending',
        '/HITL Check: check checkout/',
        '_uuid',
        'limit:1',
      ]),
    )
    stderr.mockRestore()
  })

  it('returns undefined when add succeeds but UUID lookup is empty', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValueOnce('').mockReturnValueOnce('   ')

    expect(createHitlCheckTask('plain', 'p')).toBeUndefined()
    stderr.mockRestore()
  })

  it('returns undefined without throwing when task add fails', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('task missing')
    })

    expect(createHitlCheckTask('plain', 'p')).toBeUndefined()
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('could not create'))).toBe(true)
    stderr.mockRestore()
  })
})

describe('markTaskwarriorDoneByUuid', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset()
  })

  it('marks a valid UUID done', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValue('')

    markTaskwarriorDoneByUuid('a74a94d1-2069-4e05-861e-de80143b0526')
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'task',
      ['uuid:a74a94d1-2069-4e05-861e-de80143b0526', 'done'],
      expect.objectContaining({ encoding: 'utf8' }),
    )
    stderr.mockRestore()
  })

  it('rejects invalid UUIDs before shelling out', () => {
    expect(() => markTaskwarriorDoneByUuid('not-a-uuid')).toThrow()
    expect(mockedExecFileSync).not.toHaveBeenCalled()
  })

  it('logs and continues when task done fails', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('busy')
    })

    markTaskwarriorDoneByUuid('a74a94d1-2069-4e05-861e-de80143b0526')
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('could not mark'))).toBe(true)
    stderr.mockRestore()
  })
})

describe('runTaskwarriorSync', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset()
  })

  it('runs the sync command and logs the last output line', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValue('line1\nSynced 3 tasks\n')

    runTaskwarriorSync('task sync', '/tmp/repo')
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'task sync',
      expect.objectContaining({ cwd: '/tmp/repo', shell: true }),
    )
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('Synced 3 tasks'))).toBe(true)
    stderr.mockRestore()
  })

  it('logs and continues when sync fails', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('offline')
    })

    runTaskwarriorSync('task sync', '/tmp/repo')
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('sync failed'))).toBe(true)
    stderr.mockRestore()
  })
})

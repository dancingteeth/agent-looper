import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listChildPids } from './processTree.js'

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn(),
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawnSync }
})

describe('listChildPids pgrep parse', () => {
  beforeEach(() => {
    spawnSync.mockReset()
  })

  it('parses pgrep -P stdout and drops junk tokens', () => {
    spawnSync.mockReturnValue({ stdout: '11\n12\nnope\n' })
    expect(listChildPids(10)).toEqual([11, 12])
    expect(spawnSync).toHaveBeenCalledWith('pgrep', ['-P', '10'], { encoding: 'utf8' })
  })

  it('returns empty when pgrep prints nothing', () => {
    spawnSync.mockReturnValue({ stdout: '' })
    expect(listChildPids(10)).toEqual([])
  })
})

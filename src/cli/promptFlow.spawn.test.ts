import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveAgentLoopRunBin,
  spawnLoopRun,
  spawnPreviewDetached,
  trimAssistantTail,
  waitForChildExit,
} from './promptFlow.js'

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn,
}))

const dirs: string[] = []

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-flow-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  vi.clearAllMocks()
})

function fakeChild(exitCode: number | null = null): ChildProcess {
  const child = new EventEmitter() as ChildProcess
  Object.defineProperty(child, 'exitCode', { value: exitCode, writable: true })
  child.unref = () => child
  return child
}

describe('trimAssistantTail', () => {
  it('keeps short text and ellipsizes a long tail', () => {
    expect(trimAssistantTail('short')).toBe('short')
    const long = 'x'.repeat(2000)
    const trimmed = trimAssistantTail(long)
    expect(trimmed.startsWith('…')).toBe(true)
    expect(trimmed.length).toBe(1201)
    expect(trimmed.endsWith('x'.repeat(1200))).toBe(true)
  })
})

describe('resolveAgentLoopRunBin', () => {
  it('resolves run.js next to this module', () => {
    expect(path.basename(resolveAgentLoopRunBin())).toBe('run.js')
  })
})

describe('waitForChildExit', () => {
  it('returns an already-set exit code', async () => {
    const child = fakeChild(0)
    await expect(waitForChildExit(child)).resolves.toBe(0)
  })

  it('waits for exit and treats a null code as 1', async () => {
    const child = fakeChild(null)
    const pending = waitForChildExit(child)
    child.emit('exit', null)
    await expect(pending).resolves.toBe(1)
  })
})

describe('spawnLoopRun', () => {
  it('spawns node run.js and closes the log fd when the child exits', () => {
    const repoRoot = tmpDir()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'task')
    const child = fakeChild()
    spawn.mockReturnValue(child)

    const result = spawnLoopRun(loopDir, repoRoot)
    expect(result.bundleLabel).toBe(path.join('.cursor', 'loops', 'task'))
    expect(result.logPath).toBe(path.join(loopDir, 'prompt-run.log'))
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [resolveAgentLoopRunBin(), 'run', result.bundleLabel],
      expect.objectContaining({ cwd: repoRoot }),
    )
    child.emit('exit', 0)
    expect(fs.existsSync(result.logPath)).toBe(true)
  })
})

describe('spawnPreviewDetached', () => {
  it('spawns a detached shell and unrefs the child', () => {
    const child = fakeChild()
    const unref = vi.fn(() => child)
    child.unref = unref
    spawn.mockReturnValue(child)

    expect(spawnPreviewDetached('echo hi', '/tmp')).toBe(child)
    expect(spawn).toHaveBeenCalledWith(
      'echo hi',
      expect.objectContaining({ cwd: '/tmp', shell: true, detached: true, stdio: 'ignore' }),
    )
    expect(unref).toHaveBeenCalled()
  })
})

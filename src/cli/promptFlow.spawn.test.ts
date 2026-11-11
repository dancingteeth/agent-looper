import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  readRunFailureReason,
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

  it('reports the log offset so earlier runs in the appended log are skipped', () => {
    const repoRoot = tmpDir()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'task')
    fs.mkdirSync(loopDir, { recursive: true })
    const old = 'AGENT_LOOP_DONE {"v":1,"kind":"loop","bundle":"x","complete":false,"exitCode":1,"reason":"old run"}\n'
    fs.writeFileSync(path.join(loopDir, 'prompt-run.log'), old)
    const child = fakeChild()
    spawn.mockReturnValue(child)

    const result = spawnLoopRun(loopDir, repoRoot)
    child.emit('exit', 1)
    expect(result.logOffset).toBe(Buffer.byteLength(old))
    expect(readRunFailureReason(result.logPath, result.logOffset)).toBeUndefined()
  })
})

describe('readRunFailureReason', () => {
  function writeLog(body: string): string {
    const file = path.join(tmpDir(), 'prompt-run.log')
    fs.writeFileSync(file, body)
    return file
  }

  it('prefers the AGENT_LOOP_DONE reason', () => {
    const file = writeLog(
      [
        '[agent-loop] failed: Error: DSH credentials store will not boot — aborting before WORKER.',
        '    at assertDshCredentialsStore (file:///x.js:1:1)',
        '[agent-loop] warn: could not create HITL checkpoint',
        'AGENT_LOOP_DONE {"v":1,"kind":"loop","bundle":"b","complete":false,"exitCode":1,"reason":"DSH credentials store will not boot"}',
        '',
      ].join('\n'),
    )
    expect(readRunFailureReason(file)).toBe('DSH credentials store will not boot')
  })

  it('falls back to the last failed: line without the log prefix', () => {
    const file = writeLog('[agent-loop] repo=/r\n[agent-loop] failed: Error: boom\n    at x (y:1:1)\n')
    expect(readRunFailureReason(file)).toBe('boom')
  })

  it('reads only past the offset and caps length', () => {
    const head = 'AGENT_LOOP_DONE {"v":1,"kind":"loop","bundle":"b","complete":false,"exitCode":1,"reason":"old"}\n'
    const file = writeLog(`${head}${'x'.repeat(1000)}\n`)
    const reason = readRunFailureReason(file, Buffer.byteLength(head))
    expect(reason).toHaveLength(400)
    expect(reason?.endsWith('…')).toBe(true)
  })

  it('returns undefined for a missing or empty log', () => {
    expect(readRunFailureReason(path.join(tmpDir(), 'nope.log'))).toBeUndefined()
    expect(readRunFailureReason(writeLog(''))).toBeUndefined()
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

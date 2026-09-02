import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emitAssistantText, setAssistantStreamSink } from '../stream/assistantStream.js'
import {
  appendAssistantStream,
  formatGrindPulseLines,
  GRIND_STALE_MS,
  installLoopAssistantStream,
  readAssistantStreamTail,
  readGrindPulse,
  resetAssistantStream,
} from './grindStream.js'
import { writeWatchStatus, watchStatusPath } from './loopWatch.js'

function tempLoopDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grind-stream-'))
}

function setMtime(filePath: string, msAgo: number): void {
  const at = (Date.now() - msAgo) / 1000
  fs.utimesSync(filePath, at, at)
}

describe('assistant.stream', () => {
  afterEach(() => {
    setAssistantStreamSink(undefined)
  })

  it('keeps the last nonempty lines', () => {
    const dir = tempLoopDir()
    resetAssistantStream(dir)
    appendAssistantStream(dir, 'one\n\ntwo\nthree\n')
    expect(readAssistantStreamTail(dir, 2)).toBe('two\nthree')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('installs a sink that appends emitAssistantText chunks', () => {
    const dir = tempLoopDir()
    const uninstall = installLoopAssistantStream(dir)
    emitAssistantText({ verbose: false, assistantOutput: 'none' }, 'hello ')
    emitAssistantText({ verbose: false, assistantOutput: 'none' }, 'hy3')
    uninstall()
    expect(readAssistantStreamTail(dir)).toBe('hello hy3')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('readGrindPulse', () => {
  it('classifies a live pid with fresh files as ALIVE', () => {
    const dir = tempLoopDir()
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 8,
      costUsd: 0.0019,
      phaseStartedAt: new Date().toISOString(),
      pid: 42,
    })
    fs.writeFileSync(
      path.join(dir, 'log.ndjson'),
      '{"at":"2026-09-01T19:51:00.000Z","iteration":1,"verify":{"complete":true}}\n',
    )
    const pulse = readGrindPulse(dir, { isAlive: () => true })
    expect(pulse?.verdict).toBe('ALIVE')
    expect(pulse?.pid).toBe(42)
    expect(pulse?.lastLogHint).toBe('verify PASS')
    expect(formatGrindPulseLines(pulse!).join('\n')).toMatch(/cost~\$0\.0019/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('marks a quiet live pid as ALIVE_BUT_STALE', () => {
    const dir = tempLoopDir()
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 8,
      costUsd: 0,
      phaseStartedAt: new Date(Date.now() - GRIND_STALE_MS - 5_000).toISOString(),
      pid: 42,
    })
    fs.writeFileSync(path.join(dir, 'log.ndjson'), '{"iteration":1,"verify":{"complete":true}}\n')
    resetAssistantStream(dir)
    setMtime(watchStatusPath(dir), GRIND_STALE_MS + 5_000)
    setMtime(path.join(dir, 'log.ndjson'), GRIND_STALE_MS + 5_000)
    setMtime(path.join(dir, 'assistant.stream'), GRIND_STALE_MS + 5_000)
    const pulse = readGrindPulse(dir, { isAlive: () => true })
    expect(pulse?.verdict).toBe('ALIVE_BUT_STALE')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('marks a dead pid as ENDED', () => {
    const dir = tempLoopDir()
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 8,
      costUsd: 0,
      phaseStartedAt: new Date().toISOString(),
      pid: 99,
    })
    const pulse = readGrindPulse(dir, { isAlive: () => false })
    expect(pulse?.verdict).toBe('ENDED')
    expect(pulse?.pidAlive).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

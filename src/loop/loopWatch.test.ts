import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  formatWatchStatusLine,
  WatchHeartbeat,
  deriveWatchPhase,
  parseWatchLogLine,
  readWatchSnapshot,
  readWatchView,
  writeWatchStatus,
  watchStatusPath,
  clearWatchStatus,
} from './loopWatch.js'

describe('formatWatchStatusLine', () => {
  it('formats a structured phase line for every stage', () => {
    for (const phase of ['GOAL', 'WORKER', 'VERIFY', 'JUDGE'] as const) {
      const line = formatWatchStatusLine({
        phase,
        iteration: 3,
        maxIterations: 8,
        elapsedMs: 12_000,
        costUsd: 0.04,
      })
      expect(line).toContain(`phase=${phase}`)
      expect(line).toContain('iteration=3/8')
      expect(line).toContain('elapsed=12s')
      expect(line).toContain('cost~$0.04')
      expect(line.startsWith('[agent-loop] ')).toBe(true)
    }
  })

  it('rounds sub-second elapsed down and keeps millicent costs', () => {
    const line = formatWatchStatusLine({
      phase: 'WORKER',
      iteration: 1,
      maxIterations: 8,
      elapsedMs: 12_499,
      costUsd: 0.0019,
    })
    expect(line).toContain('elapsed=12s')
    expect(line).toContain('cost~$0.0019')
  })

  it('formats costs of a cent and above to two decimals', () => {
    const line = formatWatchStatusLine({
      phase: 'WORKER',
      iteration: 1,
      maxIterations: 8,
      elapsedMs: 1000,
      costUsd: 0.04,
    })
    expect(line).toContain('cost~$0.04')
  })

  it('shows list and billed when a subscription invoice is $0', () => {
    const line = formatWatchStatusLine({
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 8,
      elapsedMs: 12_000,
      costUsd: 0.24,
      listCostUsd: 0.24,
      billedCostUsd: 0,
    })
    expect(line).toContain('list~$0.24')
    expect(line).toContain('billed $0.00')
    expect(line).not.toContain('cost~$0.00')
  })
})

describe('WatchHeartbeat', () => {
  it('emits one line immediately on phase change and repeats during WORKER with a fake clock', () => {
    vi.useFakeTimers()
    let nowMs = 1_000_000
    const emitted: string[] = []
    const heartbeat = new WatchHeartbeat({
      now: () => nowMs,
      emit: (line) => emitted.push(line),
    })

    heartbeat.update({ phase: 'WORKER', iteration: 1, maxIterations: 8, costUsd: 0.04 })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]).toContain('phase=WORKER')
    expect(emitted[0]).toContain('elapsed=0s')

    nowMs += 16_000
    vi.advanceTimersByTime(16_000)
    expect(emitted.length).toBeGreaterThanOrEqual(2)
    expect(emitted[1]).toContain('elapsed=16s')

    heartbeat.stop()
    vi.useRealTimers()
  })

  it('does not repeat a heartbeat for non-long-running phases', () => {
    vi.useFakeTimers()
    const emitted: string[] = []
    const heartbeat = new WatchHeartbeat({ emit: (line) => emitted.push(line) })
    heartbeat.update({ phase: 'VERIFY', iteration: 1, maxIterations: 8, costUsd: 0.01 })
    vi.advanceTimersByTime(60_000)
    expect(emitted).toHaveLength(1)
    heartbeat.stop()
    vi.useRealTimers()
  })
})

describe('watch snapshot parsing', () => {
  it('derives the phase from the most recent log entry', () => {
    expect(deriveWatchPhase(undefined)).toBe('GOAL')
    expect(deriveWatchPhase({ verify: { complete: false } })).toBe('WORKER')
    expect(deriveWatchPhase({ verify: { complete: true } })).toBe('VERIFY')
    expect(deriveWatchPhase({ verify: { complete: true }, review: { verdict: 'PASS' } })).toBe('JUDGE')
  })

  it('ignores malformed lines', () => {
    expect(parseWatchLogLine('')).toBeUndefined()
    expect(parseWatchLogLine('not json')).toBeUndefined()
    expect(parseWatchLogLine('{"iteration":1}')).toEqual({ iteration: 1 })
  })

  it('reconstructs a status from log.ndjson (cost + elapsed span)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-snap-'))
    const logPath = path.join(dir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      [
        '{"at":"2026-08-25T12:00:00.000Z","iteration":1,"verify":{"complete":false},"usage":{"costUsd":0.01}}',
        '{"at":"2026-08-25T12:05:00.000Z","iteration":2,"verify":{"complete":true},"usage":{"costUsd":0.008}}',
      ].join('\n'),
      'utf8',
    )

    const status = readWatchSnapshot(logPath, { maxIterations: 8 })
    expect(status).not.toBeNull()
    expect(status?.phase).toBe('VERIFY')
    expect(status?.iteration).toBe(2)
    expect(status?.maxIterations).toBe(8)
    expect(status?.elapsedMs).toBe(300_000)
    expect(status?.costUsd).toBeCloseTo(0.018)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('returns null when log.ndjson is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-snap-missing-'))
    expect(readWatchSnapshot(path.join(dir, 'log.ndjson'))).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('watch live status file', () => {
  it('prefers watch-status.json over log.ndjson and computes elapsed from phaseStartedAt', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-live-'))
    fs.writeFileSync(
      path.join(dir, 'log.ndjson'),
      '{"at":"2026-08-25T12:00:00.000Z","iteration":1,"verify":{"complete":true}}\n',
    )
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'WORKER',
      iteration: 1,
      maxIterations: 10,
      costUsd: 0.04,
      phaseStartedAt: '2026-08-26T00:00:00.000Z',
    })
    const started = Date.parse('2026-08-26T00:00:00.000Z')
    const status = readWatchView(dir, { nowMs: started + 12_000 })
    expect(status?.phase).toBe('WORKER')
    expect(status?.elapsedMs).toBe(12_000)
    expect(status?.costUsd).toBe(0.04)
    expect(status?.maxIterations).toBe(10)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('falls back to log.ndjson when the live file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-live-fallback-'))
    fs.writeFileSync(
      path.join(dir, 'log.ndjson'),
      '{"at":"2026-08-25T12:00:00.000Z","iteration":2,"verify":{"complete":true}}\n',
    )
    const status = readWatchView(dir, { maxIterations: 8 })
    expect(status?.phase).toBe('VERIFY')
    expect(status?.iteration).toBe(2)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('marks ended and freezes elapsed when the run pid is dead', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-dead-pid-'))
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'WORKER',
      iteration: 1,
      maxIterations: 3,
      costUsd: 0,
      phaseStartedAt: '2026-08-26T00:00:00.000Z',
      pid: 2_147_483_647,
    })
    const started = Date.parse('2026-08-26T00:00:00.000Z')
    const tenYearsMs = 10 * 365 * 24 * 3600 * 1000
    const status = readWatchView(dir, {
      nowMs: started + tenYearsMs,
      isAlive: () => false,
    })
    expect(status?.ended).toBe(true)
    expect(status?.phase).toBe('WORKER')
    expect(status?.elapsedMs).toBeLessThan(tenYearsMs)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('treats a live file with no pid as ended (crash leftover from before pid was written)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-no-pid-'))
    fs.writeFileSync(
      watchStatusPath(dir),
      `${JSON.stringify({
        phase: 'WORKER',
        iteration: 1,
        maxIterations: 3,
        costUsd: 0,
        phaseStartedAt: '2026-08-26T00:00:00.000Z',
      })}\n`,
    )
    const status = readWatchView(dir, { nowMs: Date.parse('2026-08-26T02:00:00.000Z') })
    expect(status?.ended).toBe(true)
    expect(status?.phase).toBe('WORKER')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('clearWatchStatus removes the live file so Watch is not stuck on a finished run', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-clear-'))
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 3,
      costUsd: 0.04,
      phaseStartedAt: '2026-08-26T00:00:00.000Z',
    })
    clearWatchStatus(watchStatusPath(dir))
    expect(readWatchView(dir)).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

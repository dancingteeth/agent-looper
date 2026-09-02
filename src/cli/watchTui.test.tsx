import { render } from 'ink-testing-library'
import { createElement } from 'react'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { WatchApp, WatchView } from './watchTui.js'
import { writeWatchStatus, watchStatusPath } from '../loop/loopWatch.js'
import { appendAssistantStream, resetAssistantStream } from '../loop/grindStream.js'

const status = {
  phase: 'WORKER',
  iteration: 1,
  maxIterations: 8,
  elapsedMs: 12_000,
  costUsd: 0.04,
} as const

describe('WatchView', () => {
  it('renders the four stage pills, figure-8 / Agent Looper chrome, and the status line', () => {
    const { lastFrame } = render(<WatchView status={status} />)
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/Agent L/)
    expect(frame).toMatch(/per/)
    expect(frame).toMatch(/GOAL/)
    expect(frame).toMatch(/WORKER/)
    expect(frame).toMatch(/VERIFY/)
    expect(frame).toMatch(/JUDGE/)
    expect(frame).toMatch(/the harness that owns the grind/)
    expect(frame).toMatch(/phase=WORKER/)
    expect(frame).toMatch(/iteration=1\/8/)
    expect(frame).toMatch(/s status/)
    const statusLine = frame.split('\n').find((line) => line.includes('phase=WORKER'))
    expect(statusLine).toBeDefined()
    expect(statusLine).not.toMatch(/Agent L/)
  })

  it('shows the assistant stream tail', () => {
    const { lastFrame } = render(
      <WatchView status={status} streamTail={'▶ Read\nthinking about GOAL'} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/▶ Read/)
    expect(frame).toMatch(/thinking about GOAL/)
  })

  it('shows pulse lines when asked', () => {
    const { lastFrame } = render(
      <WatchView
        status={status}
        showPulse
        pulse={{
          pid: 42,
          pidAlive: true,
          phase: 'JUDGE',
          iteration: 1,
          maxIterations: 8,
          elapsedMs: 403_000,
          costUsd: 0.0019,
          logAgeMs: 403_000,
          streamAgeMs: null,
          streamChars: 0,
          lastLogHint: 'verify PASS',
          quietMs: 403_000,
          verdict: 'ALIVE_BUT_STALE',
        }}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/ALIVE_BUT_STALE/)
    expect(frame).toMatch(/pid=42/)
    expect(frame).toMatch(/cost~\$0\.0019/)
  })
})

describe('WatchApp', () => {
  it('runs a pulse check on s', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-app-'))
    writeWatchStatus(watchStatusPath(dir), {
      phase: 'JUDGE',
      iteration: 1,
      maxIterations: 8,
      costUsd: 0.0019,
      phaseStartedAt: new Date().toISOString(),
      pid: process.pid,
    })
    resetAssistantStream(dir)
    appendAssistantStream(dir, 'thinking about review.md\n')
    const { lastFrame, stdin } = render(
      createElement(WatchApp, { loopDir: dir, maxIterations: 8, pollMs: 60_000 }),
    )
    stdin.write('s')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/ALIVE/)
    expect(frame).toMatch(/pid=/)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

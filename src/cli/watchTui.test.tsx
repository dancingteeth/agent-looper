import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { WatchView } from './watchTui.js'

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
    const statusLine = frame.split('\n').find((line) => line.includes('phase=WORKER'))
    expect(statusLine).toBeDefined()
    expect(statusLine).not.toMatch(/Agent L/)
  })
})

import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { TYPICAL_SETUP_STEPS } from './setupFlow.js'
import {
  FIGURE8_FRAME_COUNT,
  figure8Lines,
  progressRailFilled,
  PROGRESS_RAIL_WIDTH,
  stagePipelineTone,
  SelectPrompt,
  setupProgressRatio,
  TextPrompt,
} from './setupTui.js'

const choices = [
  { value: 'cursor', title: 'cursor', description: 'Cursor SDK worker.' },
  { value: 'dsh', title: 'dsh', description: 'PATH dsh --profile headless.' },
] as const

describe('stagePipelineTone', () => {
  it('dims later stages until the current phase starts', () => {
    expect(stagePipelineTone('GOAL', 'WORKER')).toBe('reached')
    expect(stagePipelineTone('WORKER', 'WORKER')).toBe('current')
    expect(stagePipelineTone('VERIFY', 'WORKER')).toBe('pending')
    expect(stagePipelineTone('JUDGE', 'WORKER')).toBe('pending')
  })
})

describe('figure8Lines', () => {
  it('is a 3×5 figure-8 with one moving dot', () => {
    const frames = Array.from({ length: FIGURE8_FRAME_COUNT }, (_, frame) => figure8Lines(frame))
    expect(new Set(frames.map((lines) => lines.join('\n'))).size).toBe(7)
    for (const lines of frames) {
      expect(lines).toHaveLength(3)
      const block = lines.join('')
      expect(block).toHaveLength(15)
      expect([...block].filter((cell) => cell === '·')).toHaveLength(1)
      expect(block).toMatch(/o/)
    }
    expect(figure8Lines(FIGURE8_FRAME_COUNT)).toEqual(figure8Lines(0))
  })
})

describe('setupProgressRatio', () => {
  it('fills relative to the typical default path and clamps extras', () => {
    expect(setupProgressRatio(0, TYPICAL_SETUP_STEPS)).toBe(0)
    expect(setupProgressRatio(TYPICAL_SETUP_STEPS, TYPICAL_SETUP_STEPS)).toBe(1)
    expect(setupProgressRatio(TYPICAL_SETUP_STEPS + 4, TYPICAL_SETUP_STEPS)).toBe(1)
    expect(setupProgressRatio(1, TYPICAL_SETUP_STEPS)).toBeLessThan(setupProgressRatio(10, TYPICAL_SETUP_STEPS))
    expect(progressRailFilled(0)).toBe(0)
    expect(progressRailFilled(1)).toBe(PROGRESS_RAIL_WIDTH)
  })
})

describe('SelectPrompt', () => {
  it('renders heading, cover stages, wizard chrome, and a fill rail', () => {
    const { lastFrame } = render(
      <SelectPrompt
        heading="Worker runtime"
        blurb="The SDK/CLI that implements GOAL.md."
        choices={choices}
        defaultIndex={0}
        onSubmit={() => undefined}
        onAbort={() => undefined}
        animate={false}
        progress={setupProgressRatio(3, TYPICAL_SETUP_STEPS)}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/Agent L/)
    expect(frame).toMatch(/per/)
    expect(frame).toMatch(/GOAL/)
    expect(frame).toMatch(/WORKER/)
    expect(frame).toMatch(/VERIFY/)
    expect(frame).toMatch(/JUDGE/)
    expect(frame).not.toMatch(/setup wizard/)
    expect(frame).toMatch(/the harness that owns the grind/)
    expect(frame).not.toMatch(/forever/)
    expect(frame).not.toMatch(/3 \/ ~/)
    expect(frame).toMatch(/Worker runtime/)
    expect(frame).toMatch(/cursor/)
    expect(frame).toMatch(/default/)
    expect(frame).toMatch(/Cursor SDK worker/)
  })

  it('submits the highlighted choice on enter', async () => {
    const submitted: string[] = []
    const { stdin } = render(
      <SelectPrompt
        heading="Worker runtime"
        blurb="Pick a runtime."
        choices={choices}
        defaultIndex={0}
        onSubmit={(value) => submitted.push(value)}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(submitted).toEqual(['cursor'])
  })

  it('keeps a stable frame and drops the previous description when scrolling', async () => {
    const many = Array.from({ length: 16 }, (_, i) => ({
      value: `m${i}`,
      title: `opencode-go/model-${String(i).padStart(2, '0')}`,
      description:
        i === 0
          ? 'Tencent Hy3 — slower than Flash.'
          : i === 1
            ? 'Qwen3.7 Plus — OpenCode Go catalog, second line leftover bait.'
            : `Model ${i} description.`,
    }))
    const { lastFrame, stdin } = render(
      <SelectPrompt
        heading="Judge model (reviewModel)"
        blurb="Models for opencode. Omit for its default."
        choices={many}
        defaultIndex={0}
        onSubmit={() => undefined}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    const first = lastFrame() ?? ''
    const height = first.split('\n').length
    expect(first).toMatch(/Tencent Hy3/)
    expect(first).not.toMatch(/Qwen3\.7 Plus/)
    stdin.write('\u001B[B')
    await new Promise((resolve) => setTimeout(resolve, 50))
    const second = lastFrame() ?? ''
    expect(second.split('\n').length).toBe(height)
    expect(second).toMatch(/Qwen3\.7 Plus/)
    expect(second).not.toMatch(/Tencent Hy3/)
    expect(second).toMatch(/↓ \d+ more/)
  })

  it('does not pad a short list with empty rows', () => {
    const { lastFrame } = render(
      <SelectPrompt
        heading="Worker runtime"
        blurb="Pick a runtime."
        choices={choices}
        defaultIndex={0}
        onSubmit={() => undefined}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    const lines = (lastFrame() ?? '').split('\n')
    const dsh = lines.findIndex((line) => /\bdsh\b/.test(line) && !line.includes('PATH'))
    const desc = lines.findIndex((line) => line.includes('Cursor SDK worker'))
    expect(dsh).toBeGreaterThanOrEqual(0)
    expect(desc).toBeGreaterThan(dsh)
    expect(desc - dsh).toBeLessThan(3)
    expect(lastFrame() ?? '').not.toMatch(/↑ \d+ more|↓ \d+ more/)
  })

  it('moves down then submits dsh', async () => {
    const submitted: string[] = []
    const { stdin } = render(
      <SelectPrompt
        heading="Worker runtime"
        blurb="Pick a runtime."
        choices={choices}
        defaultIndex={0}
        onSubmit={(value) => submitted.push(value)}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    stdin.write('\u001B[B')
    await new Promise((resolve) => setTimeout(resolve, 30))
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(submitted).toEqual(['dsh'])
  })
})

describe('TextPrompt', () => {
  it('submits the typed value', async () => {
    const submitted: string[] = []
    const { lastFrame, stdin } = render(
      <TextPrompt
        prompt="Custom worker model slug"
        onSubmit={(value) => submitted.push(value)}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    expect(lastFrame() ?? '').toMatch(/Custom worker model slug/)
    for (const char of 'kimi-k3') {
      stdin.write(char)
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(submitted).toEqual(['kimi-k3'])
  })
})

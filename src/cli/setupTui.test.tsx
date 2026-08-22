import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import { FIGURE8_FRAME_COUNT, figure8Lines, SelectPrompt, TextPrompt } from './setupTui.js'

const choices = [
  { value: 'cursor', title: 'cursor', description: 'Cursor SDK worker.' },
  { value: 'dsh', title: 'dsh', description: 'PATH dsh --profile headless.' },
] as const

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

describe('SelectPrompt', () => {
  it('renders heading, description, and default marker', () => {
    const { lastFrame } = render(
      <SelectPrompt
        heading="Worker runtime"
        blurb="The SDK/CLI that implements GOAL.md."
        choices={choices}
        defaultIndex={0}
        onSubmit={() => undefined}
        onAbort={() => undefined}
        animate={false}
      />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/Agent L/)
    expect(frame).toMatch(/per/)
    expect(frame).toMatch(/setup wizard/)
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

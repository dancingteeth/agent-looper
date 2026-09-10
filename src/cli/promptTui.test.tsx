import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import {
  applyPromptInput,
  DraftView,
  DoneView,
  FreezeConfirm,
  MultilinePrompt,
  visualPromptRows,
  windowPromptRows,
  wrapPromptSegment,
} from './promptTui.js'
import type { FreezeChoice } from './promptFlow.js'

const snapshot = {
  files: ['GOAL.md'],
  goalPreview: 'Ship auth',
  verifyCommand: 'bash verify.sh',
  preview: 'pnpm exec vite --host 127.0.0.1',
}

describe('applyPromptInput', () => {
  it('splits a pasted museum blurb into separate lines', () => {
    const pasted =
      "There's an old idea of mine: \"virtual museum of tech from 2000\", a website with Three.js models of objects like CD players, somewhat interactive\n\nSo young people today could have a general idea of how it felt like — by rotating a 3D model, pressing buttons and seeing what happens"
    const lines = applyPromptInput([''], pasted)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/There's an old idea/)
    expect(lines[2]).toMatch(/So young people today/)
  })

  it('splits classic Mac / raw-mode CR line breaks', () => {
    const lines = applyPromptInput([''], 'first paragraph\r\rsecond paragraph')
    expect(lines).toEqual(['first paragraph', '', 'second paragraph'])
  })
})

describe('visualPromptRows', () => {
  it('keeps both museum paragraphs when wrapping to a narrow card', () => {
    const lines = applyPromptInput(
      [''],
      "There's an old idea of mine: \"virtual museum of tech from 2000\", a website with Three.js models of objects like CD players, somewhat interactive\n\nSo young people today could have a general idea of how it felt like — by rotating a 3D model, pressing buttons and seeing what happens",
    )
    const rows = visualPromptRows(lines, 40)
    expect(rows.some((row) => /There's an old idea/.test(row))).toBe(true)
    expect(rows.some((row) => /So young people today/.test(row))).toBe(true)
    expect(rows.length).toBeGreaterThan(3)
  })
})

describe('wrapPromptSegment', () => {
  it('returns a blank row for empty text and wraps on spaces', () => {
    expect(wrapPromptSegment('', 10)).toEqual([''])
    expect(wrapPromptSegment('one two three four', 8)[0]).toBe('one two')
  })
})

describe('windowPromptRows', () => {
  it('pins the opening lines when the idea is taller than the card', () => {
    const rows = Array.from({ length: 20 }, (_, i) => `line ${i}`)
    const visible = windowPromptRows(rows, 8)
    expect(visible[0]).toBe('line 0')
    expect(visible).toContain('  …')
    expect(visible.at(-1)).toBe('line 19')
  })

  it('keeps the last row when only one line fits', () => {
    const rows = ['a', 'b', 'c']
    expect(windowPromptRows(rows, 1)).toEqual(['c'])
    expect(windowPromptRows(rows, 2)).toEqual(['a', 'c'])
  })
})

describe('DraftView', () => {
  it('shows waiting, then files, tools, and assistant tail', () => {
    const empty = render(createElement(DraftView, { state: { files: [], assistantTail: '' } }))
    expect(empty.lastFrame()).toMatch(/waiting for files/)

    const busy = render(
      createElement(DraftView, {
        state: { files: ['GOAL.md'], toolLine: 'Write', assistantTail: 'drafting\nverify' },
      }),
    )
    expect(busy.lastFrame()).toMatch(/GOAL\.md/)
    expect(busy.lastFrame()).toMatch(/Write/)
    expect(busy.lastFrame()).toMatch(/drafting/)
  })
})

describe('DoneView', () => {
  it('shows preview on success and the exit code on failure', () => {
    const ok = render(createElement(DoneView, { exitCode: 0, preview: 'pnpm preview' }))
    expect(ok.lastFrame()).toMatch(/run complete/)
    expect(ok.lastFrame()).toMatch(/preview: pnpm preview/)

    const fail = render(createElement(DoneView, { exitCode: 2 }))
    expect(fail.lastFrame()).toMatch(/run exited 2/)
  })
})

describe('MultilinePrompt', () => {
  it('keeps both paragraphs of a pasted idea on screen', async () => {
    const { lastFrame, stdin } = render(
      createElement(MultilinePrompt, {
        onSubmit: () => undefined,
        onAbort: () => undefined,
      }),
    )
    stdin.write(
      "There's an old idea of mine: virtual museum of tech from 2000\n\nSo young people today could have a general idea of how it felt like",
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    const frame = lastFrame() ?? ''
    expect(frame).toMatch(/There's an old idea/)
    expect(frame).toMatch(/So young people today/)
  })
})

describe('FreezeConfirm', () => {
  it('shows verify and preview lines', () => {
    const { lastFrame } = render(
      createElement(FreezeConfirm, {
        snapshot,
        onChoose: () => undefined,
      }),
    )
    expect(lastFrame()).toMatch(/verify: bash verify\.sh/)
    expect(lastFrame()).toMatch(/preview: pnpm exec vite/)
    expect(lastFrame()).toMatch(/Freeze and run/)
  })

  it('freezes on enter', async () => {
    const choices: FreezeChoice[] = []
    const { stdin } = render(
      createElement(FreezeConfirm, {
        snapshot,
        onChoose: (choice) => choices.push(choice),
      }),
    )
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(choices).toEqual(['run'])
  })

  it('chooses edit on e', async () => {
    const choices: FreezeChoice[] = []
    const { stdin } = render(
      createElement(FreezeConfirm, {
        snapshot,
        onChoose: (choice) => choices.push(choice),
      }),
    )
    stdin.write('e')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(choices).toEqual(['edit'])
  })

  it('aborts on escape', async () => {
    const choices: FreezeChoice[] = []
    const { stdin } = render(
      createElement(FreezeConfirm, {
        snapshot,
        onChoose: (choice) => choices.push(choice),
      }),
    )
    stdin.write('\u001B')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(choices).toEqual(['abort'])
  })
})

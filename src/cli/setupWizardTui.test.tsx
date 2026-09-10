import { render } from 'ink-testing-library'
import { describe, expect, it } from 'vitest'
import type { MenuChoice } from './setupMenus.js'
import type { SelectRequest, TextRequest, TrailEntry } from './setupWizard.js'
import {
  blankSimpleKey,
  reviewKeyAction,
  reviewRowCount,
  selectKeyAction,
  textKeyAction,
  WizardRecap,
  WizardReviewView,
  WizardRoot,
  WizardSelectView,
  WizardTextView,
} from './setupWizardTui.js'

const choices: MenuChoice[] = [
  { value: 'cursor', title: 'cursor', description: 'Cursor SDK worker.' },
  { value: 'dsh', title: 'dsh', description: 'PATH dsh --profile headless.' },
]

function textReq(): TextRequest {
  return { prompt: 'Custom worker model slug', defaultValue: undefined, trail: [] }
}

function entry(i: number): TrailEntry {
  return { kind: 'select', heading: `Step ${i}`, display: `value-${i}`, value: `value-${i}` }
}

describe('WizardRecap', () => {
  it('keeps a fixed height with zero or many answers', () => {
    const empty = render(<WizardRecap trail={[]} />)
    const full = render(<WizardRecap trail={Array.from({ length: 12 }, (_, i) => entry(i))} />)
    const emptyLines = (empty.lastFrame() ?? '').split('\n')
    const fullLines = (full.lastFrame() ?? '').split('\n')
    expect(emptyLines.length).toBe(fullLines.length)
    expect(empty.lastFrame()).toMatch(/recap builds here/)
    expect(full.lastFrame()).toMatch(/12 answered/)
    expect(full.lastFrame()).toMatch(/Step 11/)
    expect(full.lastFrame()).not.toMatch(/Step 0/)
  })
})

describe('WizardSelectView', () => {
  it('keeps a stable frame while moving the highlight', () => {
    const many: MenuChoice[] = Array.from({ length: 16 }, (_, i) => ({
      value: `m${i}`,
      title: `model-${i}`,
      description: `Description ${i}.`,
    }))
    const req: SelectRequest = { heading: 'Judge model', blurb: 'Pick one.', choices: many, defaultValue: 'm0', trail: [] }
    const first = render(<WizardSelectView req={req} index={0} />)
    const moved = render(<WizardSelectView req={req} index={1} />)
    const scrolled = render(<WizardSelectView req={req} index={5} />)
    expect(first.lastFrame()?.split('\n').length).toBe(moved.lastFrame()?.split('\n').length)
    expect(moved.lastFrame()).toMatch(/model-1/)
    expect(scrolled.lastFrame()).toMatch(/model-5/)
    expect(scrolled.lastFrame()).toMatch(/↑ 1 more/)
  })
})

describe('WizardTextView', () => {
  it('renders the prompt and typed value', () => {
    const { lastFrame } = render(<WizardTextView req={textReq()} value="kimi" />)
    expect(lastFrame()).toMatch(/Custom worker model slug/)
    expect(lastFrame()).toMatch(/kimi/)
  })
})

describe('WizardReviewView', () => {
  it('lists entries plus save/quit and keeps a stable window', () => {
    const trail = Array.from({ length: 35 }, (_, i) => entry(i))
    const top = render(<WizardReviewView trail={trail} cursor={0} />)
    const bottom = render(<WizardReviewView trail={trail} cursor={reviewRowCount(trail.length) - 1} />)
    expect(top.lastFrame()?.split('\n').length).toBe(bottom.lastFrame()?.split('\n').length)
    expect(top.lastFrame()).toMatch(/1\. Step 0/)
    expect(top.lastFrame()).toMatch(/↓ \d+ more/)
    expect(bottom.lastFrame()).toMatch(/Save — write loop.json/)
    expect(bottom.lastFrame()).toMatch(/Quit without saving/)
    expect(bottom.lastFrame()).toMatch(/↑ \d+ more/)
  })
})

describe('wizard key actions', () => {
  it('select: moves, answers, jumps, and backs', () => {
    expect(selectKeyAction(0, choices, '', blankSimpleKey({ downArrow: true }))).toEqual({ type: 'move', index: 1 })
    expect(selectKeyAction(1, choices, '', blankSimpleKey({ upArrow: true }))).toEqual({ type: 'move', index: 0 })
    expect(selectKeyAction(0, choices, '', blankSimpleKey({ returnKey: true }))).toEqual({
      type: 'answer',
      value: 'cursor',
    })
    expect(selectKeyAction(0, choices, '2', blankSimpleKey())).toEqual({ type: 'answer', value: 'dsh' })
    expect(selectKeyAction(0, choices, '', blankSimpleKey({ leftArrow: true }))).toEqual({ type: 'back' })
    expect(selectKeyAction(0, choices, '', blankSimpleKey({ escape: true }))).toEqual({ type: 'back' })
    expect(selectKeyAction(0, choices, 'c', blankSimpleKey({ ctrl: true }))).toEqual({ type: 'abort' })
  })

  it('text: types, deletes, keeps the default, and backs on left arrow', () => {
    expect(textKeyAction('', undefined, 'a', blankSimpleKey())).toEqual({ type: 'update', value: 'a' })
    expect(textKeyAction('ab', undefined, '', blankSimpleKey({ backspace: true }))).toEqual({
      type: 'update',
      value: 'a',
    })
    expect(textKeyAction('', 'dflt', '', blankSimpleKey({ returnKey: true }))).toEqual({
      type: 'answer',
      value: 'dflt',
    })
    expect(textKeyAction('x', 'dflt', '', blankSimpleKey({ returnKey: true }))).toEqual({
      type: 'answer',
      value: 'x',
    })
    expect(textKeyAction('', undefined, '', blankSimpleKey({ leftArrow: true }))).toEqual({ type: 'back' })
  })

  it('review: moves, saves, quits, and backs', () => {
    expect(reviewKeyAction(0, 5, '', blankSimpleKey({ downArrow: true }))).toEqual({ type: 'move', cursor: 1 })
    expect(reviewKeyAction(0, 5, '', blankSimpleKey({ returnKey: true }))).toEqual({ type: 'choose', row: 0 })
    expect(reviewKeyAction(0, 5, 's', blankSimpleKey())).toEqual({ type: 'save' })
    expect(reviewKeyAction(0, 5, 'q', blankSimpleKey())).toEqual({ type: 'quit' })
    expect(reviewKeyAction(0, 5, '', blankSimpleKey({ escape: true }))).toEqual({ type: 'back' })
  })
})

describe('WizardRoot', () => {
  it('advances in one mounted screen with a growing recap', async () => {
    let saved: Record<string, unknown> | undefined
    const { lastFrame, stdin, unmount } = render(
      <WizardRoot ctx={{ outDir: '/tmp/wiz' }} onDone={(answers) => { saved = answers }} onError={() => undefined} />,
    )
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(lastFrame()).toMatch(/Setup wizard/)
    stdin.write('\r')
    await new Promise((resolve) => setTimeout(resolve, 150))
    const second = lastFrame() ?? ''
    expect(second).toMatch(/Cost \/ quality preset/)
    expect(second).toMatch(/1 answered/)
    expect(saved).toBeUndefined()
    unmount()
  })
})

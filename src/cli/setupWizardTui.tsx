import { clearInkPerformanceBuffer } from './inkProductionEnv.js'
import { Box, Text, render, useInput } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultIndexForValue, type MenuChoice } from './setupMenus.js'
import { TYPICAL_SETUP_STEPS } from './setupFlow.js'
import { C, CoverFrame, LooperMark } from './loopChrome.js'
import { setupProgressRatio } from './setupTui.js'
import {
  runSetupWithReview,
  type QuestionOutcome,
  type ReviewOutcome,
  type SelectRequest,
  type TextRequest,
  type TrailEntry,
  type WizardContext,
  type WizardDriverApi,
} from './setupWizard.js'

const WIZARD_LIST_WINDOW = 9
const RECAP_ROWS = 4
const REVIEW_WINDOW = 10

export function WizardRecap({ trail }: { trail: readonly TrailEntry[] }) {
  const recent = trail.slice(-(RECAP_ROWS - 1))
  const blanks = RECAP_ROWS - 1 - recent.length
  return (
    <Box flexDirection="column" height={RECAP_ROWS} overflow="hidden" flexShrink={0}>
      <Text color="gray" wrap="truncate">
        {trail.length === 0 ? 'Answer below — recap builds here.' : `${trail.length} answered — ←/esc revisits`}
      </Text>
      {recent.map((entry, i) => (
        <Text key={`${trail.length - recent.length + i}:${entry.heading}`} color="gray" wrap="truncate">
          {'✓ '}{entry.heading}{' → '}{entry.display}
        </Text>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <Text key={`blank:${i}`}> </Text>
      ))}
    </Box>
  )
}

export function WizardSelectView({ req, index }: { req: SelectRequest; index: number }) {
  const { heading, blurb, choices, defaultValue } = req
  const defaultIndex = defaultIndexForValue(choices, defaultValue)
  const windowStart = Math.max(
    0,
    Math.min(index - Math.floor(WIZARD_LIST_WINDOW / 2), Math.max(0, choices.length - WIZARD_LIST_WINDOW)),
  )
  const visible = choices.slice(windowStart, windowStart + WIZARD_LIST_WINDOW)
  const current = choices[index]
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color="#D65D2E" bold wrap="truncate">
        {heading}
      </Text>
      <Text color="#8A8580" wrap="truncate">
        {blurb}
      </Text>
      {windowStart > 0 ? <Text color="#8A8580">  ↑ {windowStart} more</Text> : null}
      {visible.map((choice, offset) => {
        const absolute = windowStart + offset
        const selected = absolute === index
        const isDefault = absolute === defaultIndex
        return (
          <Box key={`${choice.value}:${absolute}`} height={1} overflow="hidden">
            <Text color={selected ? '#D65D2E' : '#FFFFFF'} bold={selected} wrap="truncate">
              {selected ? ' ❯ ' : '   '}
              {choice.title}
              {isDefault ? <Text color="#8A8580">  default</Text> : null}
              {choice.tag ? (
                <Text color={choice.tag === 'detected' ? '#76A17B' : '#8A8580'}>
                  {'  '}[{choice.tag}]
                </Text>
              ) : null}
            </Text>
          </Box>
        )
      })}
      {windowStart + visible.length < choices.length ? (
        <Text color="#8A8580">  ↓ {choices.length - windowStart - visible.length} more</Text>
      ) : null}
      <Text color="#C4A574" wrap="truncate">
        {current?.description ?? ''}
      </Text>
    </Box>
  )
}

export function WizardTextView({ req, value }: { req: TextRequest; value: string }) {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text color="#D65D2E" bold wrap="truncate">
        {req.prompt}
      </Text>
      {req.defaultValue !== undefined ? (
        <Text color="#8A8580" wrap="truncate">
          Enter keeps [{req.defaultValue}]
        </Text>
      ) : (
        <Text color="#8A8580" wrap="truncate">
          Type a value, then enter.
        </Text>
      )}
      <Text color="#76A17B" wrap="truncate">
        {' > '}
        {value}
        <Text inverse> </Text>
      </Text>
    </Box>
  )
}

export function reviewRowCount(trailLength: number): number {
  return trailLength + 2
}

export function WizardReviewView({ trail, cursor }: { trail: readonly TrailEntry[]; cursor: number }) {
  const saveRow = trail.length
  const quitRow = trail.length + 1
  const total = reviewRowCount(trail.length)
  const windowStart = Math.max(0, Math.min(cursor - Math.floor(REVIEW_WINDOW / 2), Math.max(0, total - REVIEW_WINDOW)))
  const rows: { key: string; label: string; tone: 'entry' | 'save' | 'quit' }[] = [
    ...trail.map((entry, i) => ({
      key: `entry:${i}`,
      label: `${entry.heading} → ${entry.display}`,
      tone: 'entry' as const,
    })),
    { key: 'save', label: 'Save — write loop.json + repo defaults', tone: 'save' as const },
    { key: 'quit', label: 'Quit without saving', tone: 'quit' as const },
  ]
  const visible = rows
    .map((row, absolute) => ({ ...row, absolute }))
    .slice(windowStart, windowStart + REVIEW_WINDOW)
  return (
    <Box flexDirection="column" flexShrink={0}>
      {windowStart > 0 ? <Text color="#8A8580">  ↑ {windowStart} more</Text> : null}
      {visible.map((row) => {
        const selected = row.absolute === cursor
        const color =
          row.tone === 'save' ? '#76A17B' : row.tone === 'quit' ? '#8A8580' : selected ? '#D65D2E' : '#FFFFFF'
        return (
          <Box key={row.key} height={1} overflow="hidden">
            <Text color={color} bold={selected} wrap="truncate">
              {selected ? ' ❯ ' : '   '}
              {row.absolute === saveRow || row.absolute === quitRow ? row.label : `${row.absolute + 1}. ${row.label}`}
            </Text>
          </Box>
        )
      })}
      {windowStart + visible.length < total ? (
        <Text color="#8A8580">  ↓ {total - windowStart - visible.length} more</Text>
      ) : null}
    </Box>
  )
}

/** Minimal key shape shared by Ink input and unit tests. */
export type SimpleKey = {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  returnKey: boolean
  escape: boolean
  ctrl: boolean
  meta: boolean
  backspace: boolean
  deleteKey: boolean
}

export function toSimpleKey(key: {
  upArrow: boolean
  downArrow: boolean
  leftArrow: boolean
  rightArrow: boolean
  return: boolean
  escape: boolean
  ctrl: boolean
  meta: boolean
  backspace: boolean
  delete: boolean
}): SimpleKey {
  return {
    upArrow: key.upArrow,
    downArrow: key.downArrow,
    leftArrow: key.leftArrow,
    rightArrow: key.rightArrow,
    returnKey: key.return,
    escape: key.escape,
    ctrl: key.ctrl,
    meta: key.meta,
    backspace: key.backspace,
    deleteKey: key.delete,
  }
}

export function blankSimpleKey(overrides: Partial<SimpleKey> = {}): SimpleKey {
  return {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    returnKey: false,
    escape: false,
    ctrl: false,
    meta: false,
    backspace: false,
    deleteKey: false,
    ...overrides,
  }
}

export type SelectKeyAction =
  | { type: 'move'; index: number }
  | { type: 'answer'; value: string }
  | { type: 'back' }
  | { type: 'abort' }
  | { type: 'noop' }

export function selectKeyAction(
  index: number,
  choices: readonly MenuChoice[],
  input: string,
  key: SimpleKey,
): SelectKeyAction {
  if (key.ctrl && input === 'c') return { type: 'abort' }
  if (key.escape || key.leftArrow) return { type: 'back' }
  if (key.upArrow || input === 'k') {
    return { type: 'move', index: index === 0 ? choices.length - 1 : index - 1 }
  }
  if (key.downArrow || input === 'j') {
    return { type: 'move', index: index === choices.length - 1 ? 0 : index + 1 }
  }
  if (key.returnKey) {
    const choice = choices[index]
    return choice ? { type: 'answer', value: choice.value } : { type: 'noop' }
  }
  if (/^[1-9]$/.test(input)) {
    const choice = choices[Number(input) - 1]
    return choice ? { type: 'answer', value: choice.value } : { type: 'noop' }
  }
  return { type: 'noop' }
}

export type TextKeyAction =
  | { type: 'update'; value: string }
  | { type: 'answer'; value: string }
  | { type: 'back' }
  | { type: 'abort' }
  | { type: 'noop' }

export function textKeyAction(
  value: string,
  defaultValue: string | undefined,
  input: string,
  key: SimpleKey,
): TextKeyAction {
  if (key.ctrl && input === 'c') return { type: 'abort' }
  if (key.escape || key.leftArrow) return { type: 'back' }
  if (key.returnKey) {
    const trimmed = value.trim()
    return { type: 'answer', value: trimmed === '' && defaultValue !== undefined ? defaultValue : trimmed }
  }
  if (key.backspace || key.deleteKey) return { type: 'update', value: value.slice(0, -1) }
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return { type: 'noop' }
  if (input && !key.ctrl && !key.meta) return { type: 'update', value: value + input }
  return { type: 'noop' }
}

export type ReviewKeyAction =
  | { type: 'move'; cursor: number }
  | { type: 'choose'; row: number }
  | { type: 'save' }
  | { type: 'quit' }
  | { type: 'back' }
  | { type: 'noop' }

export function reviewKeyAction(
  cursor: number,
  rowCount: number,
  input: string,
  key: SimpleKey,
): ReviewKeyAction {
  if (key.ctrl && input === 'c') return { type: 'quit' }
  if (key.upArrow || input === 'k') {
    return { type: 'move', cursor: cursor === 0 ? rowCount - 1 : cursor - 1 }
  }
  if (key.downArrow || input === 'j') {
    return { type: 'move', cursor: cursor === rowCount - 1 ? 0 : cursor + 1 }
  }
  if (key.returnKey) return { type: 'choose', row: cursor }
  if (key.escape || key.leftArrow) return { type: 'back' }
  if (input === 's') return { type: 'save' }
  if (input === 'q') return { type: 'quit' }
  return { type: 'noop' }
}

type Screen =
  | { type: 'idle' }
  | { type: 'select'; req: SelectRequest; index: number }
  | { type: 'text'; req: TextRequest; value: string }
  | { type: 'review'; trail: TrailEntry[]; cursor: number }

type PendingRequest =
  | { kind: 'select' | 'text'; resolve: (outcome: QuestionOutcome) => void }
  | { kind: 'review'; resolve: (outcome: ReviewOutcome) => void }

export function WizardRoot({
  ctx,
  onDone,
  onError,
}: {
  ctx: WizardContext
  onDone: (answers: Record<string, unknown>) => void
  onError: (err: unknown) => void
}) {
  const [screen, setScreen] = useState<Screen>({ type: 'idle' })
  const screenRef = useRef(screen)
  screenRef.current = screen
  const pendingRef = useRef<PendingRequest | null>(null)

  const api = useMemo<WizardDriverApi>(
    () => ({
      askSelect(req) {
        setScreen({ type: 'select', req, index: defaultIndexForValue(req.choices, req.defaultValue) })
        return new Promise<QuestionOutcome>((resolve) => {
          pendingRef.current = { kind: 'select', resolve }
        })
      },
      askText(req) {
        setScreen({ type: 'text', req, value: '' })
        return new Promise<QuestionOutcome>((resolve) => {
          pendingRef.current = { kind: 'text', resolve }
        })
      },
      askReview(trail) {
        setScreen({ type: 'review', trail, cursor: trail.length })
        return new Promise<ReviewOutcome>((resolve) => {
          pendingRef.current = { kind: 'review', resolve }
        })
      },
    }),
    [],
  )

  const doneRef = useRef({ onDone, onError })
  doneRef.current = { onDone, onError }

  useEffect(() => {
    let cancelled = false
    void runSetupWithReview(api, ctx).then(
      (answers) => {
        if (!cancelled) doneRef.current.onDone(answers)
      },
      (err) => {
        if (!cancelled) doneRef.current.onError(err)
      },
    )
    return () => {
      cancelled = true
    }
  }, [api, ctx])

  const settleQuestion = (outcome: QuestionOutcome) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setScreen({ type: 'idle' })
    if (pending && pending.kind !== 'review') pending.resolve(outcome)
  }

  const settleReview = (outcome: ReviewOutcome) => {
    const pending = pendingRef.current
    pendingRef.current = null
    setScreen({ type: 'idle' })
    if (pending && pending.kind === 'review') pending.resolve(outcome)
  }

  useInput((input, key) => {
    const scr = screenRef.current
    const simple = toSimpleKey(key)
    if (scr.type === 'select') {
      const action = selectKeyAction(scr.index, scr.req.choices, input, simple)
      if (action.type === 'move') setScreen({ ...scr, index: action.index })
      else if (action.type === 'answer') settleQuestion({ status: 'value', value: action.value })
      else if (action.type === 'abort') settleQuestion({ status: 'abort' })
      else if (action.type === 'back') {
        settleQuestion(scr.req.trail.length === 0 ? { status: 'abort' } : { status: 'back' })
      }
    } else if (scr.type === 'text') {
      const action = textKeyAction(scr.value, scr.req.defaultValue, input, simple)
      if (action.type === 'update') setScreen({ ...scr, value: action.value })
      else if (action.type === 'answer') settleQuestion({ status: 'value', value: action.value })
      else if (action.type === 'abort') settleQuestion({ status: 'abort' })
      else if (action.type === 'back') {
        settleQuestion(scr.req.trail.length === 0 ? { status: 'abort' } : { status: 'back' })
      }
    } else if (scr.type === 'review') {
      const total = reviewRowCount(scr.trail.length)
      const action = reviewKeyAction(scr.cursor, total, input, simple)
      if (action.type === 'move') setScreen({ ...scr, cursor: action.cursor })
      else if (action.type === 'save') settleReview({ type: 'save' })
      else if (action.type === 'quit') settleReview({ type: 'abort' })
      else if (action.type === 'back') settleReview({ type: 'edit', index: scr.trail.length - 1 })
      else if (action.type === 'choose') {
        if (action.row < scr.trail.length) settleReview({ type: 'edit', index: action.row })
        else if (action.row === scr.trail.length) settleReview({ type: 'save' })
        else settleReview({ type: 'abort' })
      }
    }
  })

  const answered = screen.type === 'review' ? screen.trail.length : screen.type === 'idle' ? 0 : screen.req.trail.length
  const progress = setupProgressRatio(answered, TYPICAL_SETUP_STEPS)

  return (
    <CoverFrame>
      <LooperMark isActive progress={progress} />
      {screen.type === 'review' ? (
        <Box flexDirection="column" flexShrink={0}>
          <Text color={C.terracotta} bold wrap="truncate">
            Review — {screen.trail.length} settings
          </Text>
          <Text color={C.muted} wrap="truncate">
            Enter re-answers one row; the rest is kept. Nothing is written until save.
          </Text>
          <WizardReviewView trail={screen.trail} cursor={screen.cursor} />
          <Text color={C.muted} wrap="truncate">
            ↑↓ move · enter edit/save · s save · q quit · esc last question
          </Text>
        </Box>
      ) : screen.type === 'idle' ? (
        <Text color={C.muted}>Starting setup…</Text>
      ) : (
        <Box flexDirection="column" flexShrink={0}>
          <WizardRecap trail={screen.req.trail} />
          {screen.type === 'select' ? (
            <WizardSelectView req={screen.req} index={screen.index} />
          ) : (
            <WizardTextView req={screen.req} value={screen.value} />
          )}
          <Text color={C.muted} wrap="truncate">
            {screen.type === 'select'
              ? '↑↓/jk move · enter select · 1–9 jump · ←/esc back · ctrl+c quit'
              : 'type + enter · ←/esc back · ctrl+c quit'}
          </Text>
        </Box>
      )}
    </CoverFrame>
  )
}

export async function runSetupWizard(
  outDir: string,
  detection: WizardContext['detection'],
  costPresets: WizardContext['costPresets'],
): Promise<Record<string, unknown>> {
  const ctx: WizardContext = { outDir, detection, costPresets }
  return await new Promise<Record<string, unknown>>((resolve, reject) => {
    const instance = render(
      <WizardRoot
        ctx={ctx}
        onDone={(answers) => {
          instance.unmount()
          clearInkPerformanceBuffer()
          resolve(answers)
        }}
        onError={(err) => {
          instance.unmount()
          clearInkPerformanceBuffer()
          reject(err)
        }}
      />,
      { exitOnCtrlC: false, incrementalRendering: true },
    )
  })
}

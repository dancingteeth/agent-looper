import { clearInkPerformanceBuffer } from './inkProductionEnv.js'
import { Box, Text, render, useInput } from 'ink'
import { useState, type ReactElement } from 'react'
import type { MenuChoice } from './setupMenus.js'
import { defaultIndexForValue } from './setupMenus.js'
import { TYPICAL_SETUP_STEPS, type SetupPrompts } from './setupFlow.js'
import { C, CoverFrame, LooperMark } from './loopChrome.js'

// Re-export shared cover chrome so existing consumers keep importing from here.
export {
  CoverFrame,
  CoverStages,
  Figure8Frame,
  FIGURE8_FRAME_COUNT,
  figure8Lines,
  progressRailFilled,
  PROGRESS_RAIL_WIDTH,
  StageArrow,
  StagePill,
  stagePipelineTone,
} from './loopChrome.js'

const LIST_WINDOW = 9

export function setupProgressRatio(step: number, typicalSteps: number): number {
  if (typicalSteps <= 0) return 0
  return Math.min(1, Math.max(0, step / typicalSteps))
}

export type SelectPromptProps = {
  heading: string
  blurb: string
  choices: readonly MenuChoice[]
  defaultIndex: number
  onSubmit: (value: string) => void
  onAbort: () => void
  animate?: boolean
  progress?: number
}

export function SelectPrompt({
  heading,
  blurb,
  choices,
  defaultIndex,
  onSubmit,
  onAbort,
  animate = true,
  progress,
}: SelectPromptProps) {
  const [index, setIndex] = useState(defaultIndex)
  const windowStart = Math.max(
    0,
    Math.min(index - Math.floor(LIST_WINDOW / 2), Math.max(0, choices.length - LIST_WINDOW)),
  )
  const visible = choices.slice(windowStart, windowStart + LIST_WINDOW)
  const current = choices[index]

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onAbort()
      return
    }
    if (key.upArrow || input === 'k') {
      setIndex((prev) => (prev === 0 ? choices.length - 1 : prev - 1))
      return
    }
    if (key.downArrow || input === 'j') {
      setIndex((prev) => (prev === choices.length - 1 ? 0 : prev + 1))
      return
    }
    if (key.return) {
      const choice = choices[index]
      if (choice) onSubmit(choice.value)
      return
    }
    if (/^[1-9]$/.test(input)) {
      const n = Number(input) - 1
      const jumped = choices[n]
      if (jumped) onSubmit(jumped.value)
    }
  })

  return (
    <CoverFrame>
      <LooperMark isActive={animate} progress={progress} />
      <Text color={C.terracotta} bold wrap="truncate">
        {heading}
      </Text>
      <Text color={C.muted} wrap="truncate">
        {blurb}
      </Text>
      {windowStart > 0 ? <Text color={C.muted}>  ↑ {windowStart} more</Text> : null}
      {visible.map((choice, offset) => {
        const absolute = windowStart + offset
        const selected = absolute === index
        const isDefault = absolute === defaultIndex
        return (
          <Box key={`${choice.value}:${absolute}`} height={1} overflow="hidden">
            <Text color={selected ? C.terracotta : C.white} bold={selected} wrap="truncate">
              {selected ? ' ❯ ' : '   '}
              {choice.title}
              {isDefault ? (
                <Text color={C.muted}>  default</Text>
              ) : null}
              {choice.tag ? (
                <Text color={choice.tag === 'detected' ? C.verify : C.muted}>
                  {'  '}
                  [{choice.tag}]
                </Text>
              ) : null}
            </Text>
          </Box>
        )
      })}
      {windowStart + visible.length < choices.length ? (
        <Text color={C.muted}>  ↓ {choices.length - windowStart - visible.length} more</Text>
      ) : null}
      <Text color={C.tan} wrap="truncate">
        {current?.description ?? ''}
      </Text>
      <Text color={C.muted} wrap="truncate">
        ↑↓ / j k  move  ·  enter  select  ·  1–9  jump  ·  esc  abort
      </Text>
    </CoverFrame>
  )
}

export type TextPromptProps = {
  prompt: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onAbort: () => void
  animate?: boolean
  progress?: number
}

export function TextPrompt({
  prompt,
  defaultValue,
  onSubmit,
  onAbort,
  animate = true,
  progress,
}: TextPromptProps) {
  const [value, setValue] = useState('')

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onAbort()
      return
    }
    if (key.return) {
      const trimmed = value.trim()
      onSubmit(trimmed === '' && defaultValue !== undefined ? defaultValue : trimmed)
      return
    }
    if (key.backspace || key.delete) {
      setValue((prev) => prev.slice(0, -1))
      return
    }
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return
    if (input && !key.ctrl && !key.meta) {
      setValue((prev) => prev + input)
    }
  })

  return (
    <CoverFrame>
      <LooperMark isActive={animate} progress={progress} />
      <Text color={C.terracotta} bold wrap="truncate">
        {prompt}
      </Text>
      {defaultValue !== undefined ? (
        <Text color={C.muted} wrap="truncate">
          Enter keeps [{defaultValue}]
        </Text>
      ) : (
        <Text color={C.muted} wrap="truncate">
          Type a value, then enter. Esc aborts.
        </Text>
      )}
      <Text color={C.verify} wrap="truncate">
        {' > '}
        {value}
        <Text inverse> </Text>
      </Text>
    </CoverFrame>
  )
}

async function runInkPrompt<T>(
  element: (done: (value: T) => void, abort: () => void) => ReactElement,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const instance = render(
      element(
        (value) => {
          instance.unmount()
          clearInkPerformanceBuffer()
          resolve(value)
        },
        () => {
          instance.unmount()
          clearInkPerformanceBuffer()
          reject(new Error('setup aborted'))
        },
      ),
      { exitOnCtrlC: false, incrementalRendering: true },
    )
  })
}

export function createInkPrompts(): SetupPrompts {
  let step = 0
  return {
    async select(heading, blurb, choices, defaultValue) {
      step += 1
      const progress = setupProgressRatio(step, TYPICAL_SETUP_STEPS)
      const defaultIndex = defaultIndexForValue(choices, defaultValue)
      return await runInkPrompt((done, abort) => (
        <SelectPrompt
          heading={heading}
          blurb={blurb}
          choices={choices}
          defaultIndex={defaultIndex}
          onSubmit={done}
          onAbort={abort}
          progress={progress}
        />
      ))
    },
    async text(prompt, dflt) {
      step += 1
      const progress = setupProgressRatio(step, TYPICAL_SETUP_STEPS)
      return await runInkPrompt((done, abort) => (
        <TextPrompt
          prompt={prompt}
          defaultValue={dflt}
          onSubmit={done}
          onAbort={abort}
          progress={progress}
        />
      ))
    },
  }
}

import { Box, Text, render, useAnimation, useInput } from 'ink'
import { useState, type ReactElement } from 'react'
import type { MenuChoice } from './setupMenus.js'
import { defaultIndexForValue } from './setupMenus.js'
import type { SetupPrompts } from './setupFlow.js'

/** Cover palette — Agent Looper DSH (terracotta / verify green). */
const C = {
  terracotta: '#D65D2E',
  verify: '#76A17B',
  tan: '#C4A574',
  muted: '#8A8580',
  white: '#FFFFFF',
} as const

const LIST_WINDOW = 9

/** 3×5 figure-8 (the `oo` in Looper). Dot walks this path. */
const FIGURE8_SKELETON: readonly (readonly string[])[] = [
  [' ', 'o', ' ', 'o', ' '],
  ['o', ' ', ' ', ' ', 'o'],
  [' ', 'o', ' ', 'o', ' '],
]

const FIGURE8_PATH: readonly [row: number, col: number][] = [
  [1, 0],
  [0, 1],
  [1, 2],
  [0, 3],
  [1, 4],
  [2, 3],
  [1, 2],
  [2, 1],
]

export const FIGURE8_FRAME_COUNT = FIGURE8_PATH.length

/** One animation frame of the Looper `oo` mark (three lines, five cells). */
export function figure8Lines(frame: number): [string, string, string] {
  const grid = FIGURE8_SKELETON.map((row) => [...row])
  const slot = FIGURE8_PATH[((frame % FIGURE8_PATH.length) + FIGURE8_PATH.length) % FIGURE8_PATH.length]
  if (slot !== undefined) {
    const [row, col] = slot
    const line = grid[row]
    if (line) line[col] = '·'
  }
  return [grid[0]?.join('') ?? '', grid[1]?.join('') ?? '', grid[2]?.join('') ?? '']
}

function Figure8Frame({ frame }: { frame: number }) {
  const lines = figure8Lines(frame)
  return (
    <Box flexDirection="column" width={5} height={3} flexShrink={0} marginX={1}>
      {lines.map((line, lineIndex) => (
        <Text key={lineIndex}>
          {[...line].map((cell, cellIndex) => (
            <Text
              key={cellIndex}
              color={cell === '·' ? C.verify : cell === 'o' ? C.terracotta : C.muted}
            >
              {cell === ' ' ? '\u00A0' : cell}
            </Text>
          ))}
        </Text>
      ))}
    </Box>
  )
}

export function LooperMark({ isActive = true }: { isActive?: boolean }) {
  const { frame } = useAnimation({ interval: 140, isActive })
  return (
    <Box flexDirection="row" alignItems="center">
      <Text color={C.white} bold>
        Agent L
      </Text>
      <Figure8Frame frame={isActive ? frame : 0} />
      <Text color={C.white} bold>
        per
      </Text>
      <Text color={C.muted}>  setup wizard</Text>
    </Box>
  )
}

export type SelectPromptProps = {
  heading: string
  blurb: string
  choices: readonly MenuChoice[]
  defaultIndex: number
  onSubmit: (value: string) => void
  onAbort: () => void
  animate?: boolean
}

export function SelectPrompt({
  heading,
  blurb,
  choices,
  defaultIndex,
  onSubmit,
  onAbort,
  animate = true,
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
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1} paddingY={0}>
        <LooperMark isActive={animate} />
        <Text color={C.terracotta} bold>
          {heading}
        </Text>
        <Text color={C.muted} wrap="wrap">
          {blurb}
        </Text>
        <Text> </Text>
        {windowStart > 0 ? <Text color={C.muted}>  ↑ {windowStart} more</Text> : null}
        {visible.map((choice, offset) => {
          const absolute = windowStart + offset
          const selected = absolute === index
          const isDefault = absolute === defaultIndex
          return (
            <Box key={`${choice.value}:${absolute}`}>
              <Text color={selected ? C.terracotta : C.white} bold={selected}>
                {selected ? ' ❯ ' : '   '}
                {choice.title}
                {isDefault ? (
                  <Text color={C.muted}>  default</Text>
                ) : null}
              </Text>
            </Box>
          )
        })}
        {windowStart + visible.length < choices.length ? (
          <Text color={C.muted}>  ↓ {choices.length - windowStart - visible.length} more</Text>
        ) : null}
        <Text> </Text>
        <Box flexDirection="column" minHeight={3}>
          <Text color={C.tan} wrap="wrap">
            {current?.description ?? ''}
          </Text>
        </Box>
        <Text color={C.muted}>
          ↑↓ / j k  move  ·  enter  select  ·  1–9  jump  ·  esc  abort
        </Text>
      </Box>
    </Box>
  )
}

export type TextPromptProps = {
  prompt: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onAbort: () => void
  animate?: boolean
}

export function TextPrompt({ prompt, defaultValue, onSubmit, onAbort, animate = true }: TextPromptProps) {
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
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1}>
        <LooperMark isActive={animate} />
        <Text color={C.terracotta} bold>
          {prompt}
        </Text>
        {defaultValue !== undefined ? (
          <Text color={C.muted}>Enter keeps [{defaultValue}]</Text>
        ) : (
          <Text color={C.muted}>Type a value, then enter. Esc aborts.</Text>
        )}
        <Text> </Text>
        <Text color={C.verify}>
          {' > '}
          {value}
          <Text inverse> </Text>
        </Text>
      </Box>
    </Box>
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
          resolve(value)
        },
        () => {
          instance.unmount()
          reject(new Error('setup aborted'))
        },
      ),
      { exitOnCtrlC: false, incrementalRendering: true },
    )
  })
}

export function createInkPrompts(): SetupPrompts {
  return {
    async select(heading, blurb, choices, defaultValue) {
      const defaultIndex = defaultIndexForValue(choices, defaultValue)
      return await runInkPrompt((done, abort) => (
        <SelectPrompt
          heading={heading}
          blurb={blurb}
          choices={choices}
          defaultIndex={defaultIndex}
          onSubmit={done}
          onAbort={abort}
        />
      ))
    },
    async text(prompt, dflt) {
      return await runInkPrompt((done, abort) => (
        <TextPrompt prompt={prompt} defaultValue={dflt} onSubmit={done} onAbort={abort} />
      ))
    },
  }
}

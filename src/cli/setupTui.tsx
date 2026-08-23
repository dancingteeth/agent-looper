import { clearInkPerformanceBuffer } from './inkProductionEnv.js'
import { Box, Text, render, useAnimation, useInput } from 'ink'
import { useState, type ReactElement } from 'react'
import type { MenuChoice } from './setupMenus.js'
import { defaultIndexForValue } from './setupMenus.js'
import { TYPICAL_SETUP_STEPS, type SetupPrompts } from './setupFlow.js'

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

export const PROGRESS_RAIL_WIDTH = 22

export function setupProgressRatio(step: number, typicalSteps: number): number {
  if (typicalSteps <= 0) return 0
  return Math.min(1, Math.max(0, step / typicalSteps))
}

export function progressRailFilled(ratio: number, width: number = PROGRESS_RAIL_WIDTH): number {
  return Math.round(Math.min(1, Math.max(0, ratio)) * width)
}

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

function StagePill({ label, color }: { label: string; color: string }) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={0} flexShrink={0}>
      <Text color={color} bold>
        {label}
      </Text>
    </Box>
  )
}

function StageArrow() {
  return (
    <Box flexDirection="column" height={3} flexShrink={0}>
      <Text> </Text>
      <Text color={C.muted}>→</Text>
      <Text> </Text>
    </Box>
  )
}

function CoverStages() {
  return (
    <Box flexDirection="row" alignItems="center" marginLeft={1} flexWrap="wrap">
      <StagePill label="GOAL" color={C.terracotta} />
      <StageArrow />
      <StagePill label="WORKER" color={C.muted} />
      <StageArrow />
      <StagePill label="VERIFY" color={C.verify} />
      <StageArrow />
      <StagePill label="JUDGE" color={C.tan} />
    </Box>
  )
}

function ProgressRail({ ratio }: { ratio: number }) {
  const filled = progressRailFilled(ratio)
  const empty = PROGRESS_RAIL_WIDTH - filled
  return (
    <Box>
      <Text color={C.terracotta}>{'━'.repeat(filled)}</Text>
      <Text color={C.muted}>{'─'.repeat(empty)}</Text>
    </Box>
  )
}

export function LooperMark({
  isActive = true,
  progress,
}: {
  isActive?: boolean
  progress?: number
}) {
  const { frame } = useAnimation({ interval: 140, isActive })
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" alignItems="center" flexWrap="wrap">
        <Text color={C.white} bold>
          Agent L
        </Text>
        <Figure8Frame frame={isActive ? frame : 0} />
        <Text color={C.white} bold>
          per
        </Text>
        <CoverStages />
      </Box>
      <Text color={C.muted}>the harness that owns the grind.</Text>
      {progress !== undefined ? <ProgressRail ratio={progress} /> : null}
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
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1} paddingY={0}>
        <LooperMark isActive={animate} progress={progress} />
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
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={C.terracotta} paddingX={1}>
        <LooperMark isActive={animate} progress={progress} />
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

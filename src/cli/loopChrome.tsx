import { Fragment } from 'react'
import { Box, Text, useAnimation } from 'ink'

/** Cover palette — Agent Looper DSH (terracotta / verify green). */
export const C = {
  terracotta: '#D65D2E',
  verify: '#76A17B',
  tan: '#C4A574',
  muted: '#8A8580',
  /** Pending Watch pills — readable but almost gone. */
  ghost: '#4A4542',
  white: '#FFFFFF',
} as const

export const PROGRESS_RAIL_WIDTH = 22

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

export function Figure8Frame({ frame }: { frame: number }) {
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

export function StagePill({
  label,
  color,
  dim = false,
}: {
  label: string
  color: string
  dim?: boolean
}) {
  return (
    <Box borderStyle="round" borderColor={color} paddingX={0} flexShrink={0}>
      <Text color={color} bold={!dim} dimColor={dim}>
        {label}
      </Text>
    </Box>
  )
}

export function StageArrow() {
  return (
    <Box flexDirection="column" height={3} flexShrink={0}>
      <Text> </Text>
      <Text color={C.muted}>→</Text>
      <Text> </Text>
    </Box>
  )
}

const STAGE_COLORS: readonly { label: string; color: string }[] = [
  { label: 'GOAL', color: C.terracotta },
  { label: 'WORKER', color: C.muted },
  { label: 'VERIFY', color: C.verify },
  { label: 'JUDGE', color: C.tan },
]

export type StagePipelineTone = 'pending' | 'current' | 'reached'

/** Linear GOAL→WORKER→VERIFY→JUDGE lighting for Watch. Setup omits `active`. */
export function stagePipelineTone(stage: string, current: string): StagePipelineTone {
  const order = STAGE_COLORS.map((entry) => entry.label)
  const stageIndex = order.indexOf(stage)
  const currentIndex = order.indexOf(current)
  if (stageIndex < 0 || currentIndex < 0) return 'pending'
  if (stageIndex < currentIndex) return 'reached'
  if (stageIndex === currentIndex) return 'current'
  return 'pending'
}

function pillStyle(
  stage: (typeof STAGE_COLORS)[number],
  active: string | undefined,
  idle: boolean,
): { color: string; dim: boolean } {
  if (idle && (active === undefined || active === '')) {
    return { color: C.ghost, dim: true }
  }
  if (active === undefined || active === '') {
    return { color: stage.color, dim: false }
  }
  const tone = stagePipelineTone(stage.label, active)
  switch (tone) {
    case 'current':
      return { color: C.white, dim: false }
    case 'reached':
      return { color: stage.color, dim: false }
    case 'pending':
      return { color: C.ghost, dim: true }
    default: {
      const _exhaustive: never = tone
      return _exhaustive
    }
  }
}

export function CoverStages({
  active,
  idle = false,
}: {
  active?: string
  /** Watch, no phase yet: every pill stays ghosted. */
  idle?: boolean
} = {}) {
  return (
    <Box flexDirection="row" alignItems="center" marginLeft={1} flexWrap="wrap">
      {STAGE_COLORS.map((stage, index) => {
        const style = pillStyle(stage, active, idle)
        return (
          <Fragment key={stage.label}>
            {index > 0 ? <StageArrow /> : null}
            <StagePill label={stage.label} color={style.color} dim={style.dim} />
          </Fragment>
        )
      })}
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
  activeStage,
  idlePipeline = false,
}: {
  isActive?: boolean
  progress?: number
  activeStage?: string
  idlePipeline?: boolean
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
        <CoverStages active={activeStage} idle={idlePipeline} />
      </Box>
      <Text color={C.muted}>the harness that owns the grind.</Text>
      {progress !== undefined ? <ProgressRail ratio={progress} /> : null}
    </Box>
  )
}

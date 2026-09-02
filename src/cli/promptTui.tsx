import type { ChildProcess } from 'node:child_process'
import { signalProcessTree } from '../agents/processTree.js'
import { clearInkPerformanceBuffer } from './inkProductionEnv.js'
import { Box, Text, render, useInput, usePaste, useWindowSize } from 'ink'
import { createElement, useState, type ReactElement } from 'react'
import { C, CoverFrame, LooperMark } from './loopChrome.js'
import { WatchApp } from './watchTui.js'
import type { DraftSnapshot, DraftStreamState, FreezeChoice } from './promptFlow.js'

function bindProcessSignals(handler: () => void): () => void {
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
  return () => {
    process.removeListener('SIGINT', handler)
    process.removeListener('SIGTERM', handler)
  }
}

/** Rows reserved for border, compact logo, question, and shortcuts. */
const PROMPT_CHROME_ROWS = 8

export function applyPromptInput(lines: string[], chunk: string): string[] {
  const parts = chunk.split(/\r\n|\n|\r/)
  const next = [...lines]
  const last = next.length - 1
  next[last] = `${next[last] ?? ''}${parts[0] ?? ''}`
  for (let i = 1; i < parts.length; i++) {
    next.push(parts[i] ?? '')
  }
  return next
}

export function wrapPromptSegment(text: string, width: number): string[] {
  const max = Math.max(1, width)
  if (text.length === 0) return ['']
  const rows: string[] = []
  let rest = text
  while (rest.length > max) {
    const slice = rest.slice(0, max)
    const breakAt = slice.lastIndexOf(' ')
    const cut = breakAt >= Math.floor(max / 2) ? breakAt : max
    rows.push(rest.slice(0, cut).trimEnd())
    rest = rest.slice(cut).trimStart()
  }
  rows.push(rest)
  return rows
}

export function visualPromptRows(lines: string[], width: number): string[] {
  const last = lines.length - 1
  return lines.flatMap((line, index) => {
    const prefix = index === last ? '> ' : '  '
    const wrapped = wrapPromptSegment(line, Math.max(1, width - prefix.length))
    return wrapped.map((row, rowIndex) => (rowIndex === 0 ? `${prefix}${row}` : `${' '.repeat(prefix.length)}${row}`))
  })
}

/** Keep the opening lines and the cursor line when the idea is taller than the card. */
export function windowPromptRows(rows: string[], maxRows: number): string[] {
  if (maxRows < 1 || rows.length <= maxRows) return rows
  if (maxRows === 1) return rows.slice(-1)
  if (maxRows === 2) return [rows[0] ?? '', rows[rows.length - 1] ?? '']
  const keepHead = Math.min(3, maxRows - 2)
  const keepTail = maxRows - keepHead - 1
  return [...rows.slice(0, keepHead), '  …', ...rows.slice(rows.length - keepTail)]
}

export type MultilinePromptProps = {
  onSubmit: (value: string) => void
  onAbort: () => void
}

export function MultilinePrompt({ onSubmit, onAbort }: MultilinePromptProps) {
  const [lines, setLines] = useState<string[]>([''])
  const { columns, rows } = useWindowSize()

  usePaste((text) => {
    setLines((prev) => applyPromptInput(prev, text))
  })

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onAbort()
      return
    }
    if (key.ctrl && (input === 'd' || input === 's')) {
      const text = lines.join('\n').trim()
      if (text) onSubmit(text)
      return
    }
    if (key.return) {
      if (input && input !== '\r' && input !== '\n') {
        setLines((prev) => applyPromptInput(prev, input))
        return
      }
      setLines((prev) => [...prev, ''])
      return
    }
    if (key.backspace || key.delete) {
      setLines((prev) => {
        const last = prev[prev.length - 1] ?? ''
        if (last.length > 0) {
          const next = [...prev]
          next[next.length - 1] = last.slice(0, -1)
          return next
        }
        if (prev.length <= 1) return prev
        const merged = [...prev]
        const popped = merged.pop() ?? ''
        merged[merged.length - 1] = `${merged[merged.length - 1] ?? ''}${popped}`
        return merged
      })
      return
    }
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return
    if (input && !key.ctrl && !key.meta) {
      setLines((prev) => applyPromptInput(prev, input))
    }
  })

  const innerWidth = Math.max(24, columns - 8)
  const maxIdeaRows = Math.max(6, rows - PROMPT_CHROME_ROWS)
  const visible = windowPromptRows(visualPromptRows(lines, innerWidth), maxIdeaRows)

  return (
    <CoverFrame overflow="visible">
      <LooperMark isActive={false} compact />
      <Text color={C.terracotta} bold wrap="truncate">
        What should this loop achieve?
      </Text>
      <Text color={C.muted} wrap="truncate">
        Enter newline · ctrl+d submit · esc abort
      </Text>
      <Box flexDirection="column" flexShrink={0}>
        {visible.map((row, offset) => (
          <Box key={`${offset}:${row.slice(0, 12)}`} height={1} flexShrink={0} overflow="hidden">
            <Text color={C.white} wrap="truncate">
              {row}
            </Text>
          </Box>
        ))}
      </Box>
    </CoverFrame>
  )
}

export type DraftViewProps = {
  state: DraftStreamState
}

export function DraftView({ state }: DraftViewProps) {
  return (
    <CoverFrame>
      <LooperMark isActive progress={0.45} />
      <Text color={C.terracotta} bold wrap="truncate">
        Drafting bundle…
      </Text>
      <Text color={C.muted} wrap="truncate">
        {state.files.length > 0 ? state.files.join(' · ') : 'waiting for files'}
      </Text>
      {state.toolLine ? (
        <Text color={C.tan} wrap="truncate">
          {state.toolLine}
        </Text>
      ) : null}
      {state.assistantTail ? (
        <Text color={C.white} wrap="truncate">
          {state.assistantTail.split('\n').slice(-4).join(' ')}
        </Text>
      ) : null}
    </CoverFrame>
  )
}

export type FreezeConfirmProps = {
  snapshot: DraftSnapshot
  onChoose: (choice: FreezeChoice) => void
}

export function FreezeConfirm({ snapshot, onChoose }: FreezeConfirmProps) {
  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) {
      onChoose('abort')
      return
    }
    if (key.return) {
      onChoose('run')
      return
    }
    if (input === 'e' || input === 'E') {
      onChoose('edit')
    }
  })

  return (
    <CoverFrame>
      <LooperMark isActive progress={0.75} />
      <Text color={C.terracotta} bold wrap="truncate">
        Freeze and run?
      </Text>
      <Text color={C.muted} wrap="truncate">
        verify: {snapshot.verifyCommand}
      </Text>
      {snapshot.preview ? (
        <Text color={C.muted} wrap="truncate">
          preview: {snapshot.preview}
        </Text>
      ) : null}
      <Text color={C.white} wrap="truncate">
        {snapshot.goalPreview.split('\n').slice(0, 3).join(' · ')}
      </Text>
      <Text color={C.tan} wrap="truncate">
        enter freeze+run · e edit yourself · esc abort
      </Text>
    </CoverFrame>
  )
}

export type DoneViewProps = {
  exitCode: number
  preview?: string
}

export function DoneView({ exitCode, preview }: DoneViewProps) {
  return (
    <CoverFrame>
      <LooperMark idlePipeline />
      <Text color={exitCode === 0 ? C.verify : C.terracotta} bold wrap="truncate">
        {exitCode === 0 ? 'run complete' : `run exited ${exitCode}`}
      </Text>
      {exitCode === 0 && preview ? (
        <Text color={C.muted} wrap="truncate">
          preview: {preview}
        </Text>
      ) : null}
    </CoverFrame>
  )
}

async function runInkScreen<T>(
  element: (done: (value: T) => void, abort: () => void) => ReactElement,
  inkOptions: { incrementalRendering?: boolean } = {},
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
          reject(new Error('prompt aborted'))
        },
      ),
      {
        exitOnCtrlC: false,
        incrementalRendering: inkOptions.incrementalRendering ?? true,
      },
    )
  })
}

export async function readIdeaInk(): Promise<string> {
  return await runInkScreen<string>(
    (done, abort) => createElement(MultilinePrompt, { onSubmit: done, onAbort: abort }),
    { incrementalRendering: false },
  )
}

export async function confirmFreezeInk(snapshot: DraftSnapshot): Promise<FreezeChoice> {
  return await runInkScreen<FreezeChoice>((done) =>
    createElement(FreezeConfirm, { snapshot, onChoose: done }),
  )
}

export function renderDraftInk(
  onReady: () => void,
  getState: () => DraftStreamState,
): { update: () => void; unmount: () => void } {
  let mounted = true
  const instance = render(
    createElement(DraftView, { state: getState() }),
    { exitOnCtrlC: false, incrementalRendering: true },
  )
  onReady()
  return {
    update() {
      if (!mounted) return
      instance.rerender(createElement(DraftView, { state: getState() }))
    },
    unmount() {
      if (!mounted) return
      mounted = false
      instance.unmount()
      clearInkPerformanceBuffer()
    },
  }
}

export async function watchChildInk(
  loopDir: string,
  child: ChildProcess,
  maxIterations?: number,
): Promise<number> {
  return await new Promise<number>((resolve) => {
    let settled = false
    const onSigint = () => {
      signalProcessTree(child.pid, 'SIGTERM')
    }
    const unbind = bindProcessSignals(onSigint)
    const finish = (code: number) => {
      if (settled) return
      settled = true
      unbind()
      instance.unmount()
      clearInkPerformanceBuffer()
      resolve(code)
    }

    child.once('exit', (code) => finish(code ?? 1))

    const instance = render(
      createElement(WatchApp, { loopDir, maxIterations }),
      { exitOnCtrlC: false, incrementalRendering: true },
    )
  })
}

export async function showDoneInk(exitCode: number, preview?: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const instance = render(createElement(DoneView, { exitCode, preview }), {
      exitOnCtrlC: false,
      incrementalRendering: true,
    })
    const stop = () => {
      unbind()
      clearTimeout(timer)
      instance.unmount()
      clearInkPerformanceBuffer()
      resolve()
    }
    const unbind = bindProcessSignals(stop)
    const timer = setTimeout(stop, 2500)
  })
}

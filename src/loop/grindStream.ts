import fs from 'node:fs'
import path from 'node:path'
import {
  clearAssistantStreamSink,
  setAssistantStreamSink,
} from '../stream/assistantStream.js'
import {
  formatWatchCostPhrase,
  parseWatchLogLine,
  processIsAlive,
  readWatchLiveFile,
  readWatchView,
  watchStatusPath,
  type WatchPhase,
  type WatchStatus,
} from './loopWatch.js'

export const ASSISTANT_STREAM_BASENAME = 'assistant.stream'

const MAX_STREAM_CHARS = 64 * 1024
const TAIL_LINES = 8
export const GRIND_STALE_MS = 180_000
export const GRIND_HUNG_MS = 600_000

export type GrindPulseVerdict =
  | 'ALIVE'
  | 'ALIVE_BUT_STALE'
  | 'ALIVE_BUT_HUNG'
  | 'DEAD'
  | 'ENDED'

export type GrindPulse = {
  pid?: number
  pidAlive: boolean
  phase: WatchPhase
  iteration: number
  maxIterations: number
  elapsedMs: number
  costUsd: number
  listCostUsd?: number
  billedCostUsd?: number
  logAgeMs: number | null
  streamAgeMs: number | null
  streamChars: number
  lastLogHint: string
  quietMs: number
  verdict: GrindPulseVerdict
}

export function assistantStreamPath(loopDir: string): string {
  return path.join(loopDir, ASSISTANT_STREAM_BASENAME)
}

export function resetAssistantStream(loopDir: string): void {
  try {
    fs.writeFileSync(assistantStreamPath(loopDir), '', 'utf8')
  } catch {
    // Watch still works without a stream file
  }
}

export function appendAssistantStream(loopDir: string, chunk: string): void {
  if (!chunk) return
  const filePath = assistantStreamPath(loopDir)
  try {
    fs.appendFileSync(filePath, chunk, 'utf8')
  } catch {
    return
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    if (text.length <= MAX_STREAM_CHARS) return
    fs.writeFileSync(filePath, text.slice(-MAX_STREAM_CHARS), 'utf8')
  } catch {
    // ignore trim failures
  }
}

export function readAssistantStreamTail(
  loopDir: string,
  maxLines: number = TAIL_LINES,
): string {
  let text: string
  try {
    text = fs.readFileSync(assistantStreamPath(loopDir), 'utf8')
  } catch {
    return ''
  }
  const lines = text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  return lines.slice(-maxLines).join('\n')
}

export function installLoopAssistantStream(loopDir: string): () => void {
  const sink = (chunk: string) => {
    appendAssistantStream(loopDir, chunk)
  }
  setAssistantStreamSink(sink)
  return () => {
    clearAssistantStreamSink(sink)
  }
}

function fileAgeMs(filePath: string, nowMs: number): number | null {
  try {
    return Math.max(0, nowMs - fs.statSync(filePath).mtimeMs)
  } catch {
    return null
  }
}

function minAge(ages: Array<number | null>): number | null {
  const present = ages.filter((age): age is number => age !== null)
  if (present.length === 0) return null
  return Math.min(...present)
}

function lastLogHint(loopDir: string): string {
  let content: string
  try {
    content = fs.readFileSync(path.join(loopDir, 'log.ndjson'), 'utf8')
  } catch {
    return 'no log.ndjson'
  }
  const lines = content
    .split('\n')
    .map(parseWatchLogLine)
    .filter((entry) => entry !== undefined)
  const last = lines[lines.length - 1]
  if (!last) return 'empty log'
  if (last.review?.verdict) return `review ${last.review.verdict}`
  if (last.verify?.complete === true) return 'verify PASS'
  if (last.verify?.complete === false) return 'verify FAIL'
  if (last.iteration !== undefined) return `iteration ${last.iteration}`
  return 'log updated'
}

function classifyPulse(input: {
  ended?: boolean
  pidAlive: boolean
  quietMs: number
}): GrindPulseVerdict {
  if (input.ended) return 'ENDED'
  if (!input.pidAlive) return 'DEAD'
  if (input.quietMs >= GRIND_HUNG_MS) return 'ALIVE_BUT_HUNG'
  if (input.quietMs >= GRIND_STALE_MS) return 'ALIVE_BUT_STALE'
  return 'ALIVE'
}

export function readGrindPulse(
  loopDir: string,
  options?: {
    nowMs?: number
    isAlive?: (pid: number) => boolean
    maxIterations?: number
  },
): GrindPulse | null {
  const nowMs = options?.nowMs ?? Date.now()
  const isAlive = options?.isAlive ?? processIsAlive
  const status: WatchStatus | null = readWatchView(loopDir, {
    nowMs,
    isAlive,
    maxIterations: options?.maxIterations,
  })
  if (!status) return null

  const live = readWatchLiveFile(watchStatusPath(loopDir))
  const pid = live?.pid
  const pidAlive = pid !== undefined && isAlive(pid)
  const logAgeMs = fileAgeMs(path.join(loopDir, 'log.ndjson'), nowMs)
  const streamPath = assistantStreamPath(loopDir)
  const streamAgeMs = fileAgeMs(streamPath, nowMs)
  let streamChars = 0
  try {
    streamChars = fs.statSync(streamPath).size
  } catch {
    streamChars = 0
  }
  const statusAgeMs = fileAgeMs(watchStatusPath(loopDir), nowMs)
  const quietMs = minAge([logAgeMs, streamAgeMs, statusAgeMs]) ?? status.elapsedMs

  return {
    ...(pid !== undefined ? { pid } : {}),
    pidAlive,
    phase: status.phase,
    iteration: status.iteration,
    maxIterations: status.maxIterations,
    elapsedMs: status.elapsedMs,
    costUsd: status.costUsd,
    listCostUsd: status.listCostUsd,
    billedCostUsd: status.billedCostUsd,
    logAgeMs,
    streamAgeMs,
    streamChars,
    lastLogHint: lastLogHint(loopDir),
    quietMs,
    verdict: classifyPulse({
      ended: status.ended,
      pidAlive,
      quietMs,
    }),
  }
}

function formatAge(ms: number | null): string {
  if (ms === null) return 'missing'
  const seconds = Math.round(ms / 1000)
  return `${seconds}s`
}

export function formatGrindPulseLines(pulse: GrindPulse): string[] {
  const pidBit = pulse.pid !== undefined ? `pid=${pulse.pid} ` : ''
  const streamBit =
    pulse.streamChars === 0
      ? 'stream empty'
      : `stream ${formatAge(pulse.streamAgeMs)} (${pulse.streamChars}B)`
  return [
    `${pidBit}${pulse.verdict}`,
    `phase=${pulse.phase} ${pulse.iteration}/${pulse.maxIterations} ` +
      `elapsed=${Math.round(pulse.elapsedMs / 1000)}s ${formatWatchCostPhrase(pulse)}`,
    `log quiet ${formatAge(pulse.logAgeMs)} · ${streamBit}`,
    `last: ${pulse.lastLogHint}`,
    'SDK can stay silent until wait() — live pid is the heartbeat',
  ]
}

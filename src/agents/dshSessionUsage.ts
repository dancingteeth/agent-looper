import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { createUsageRecord, type AgentRunPhase, type LoopUsageRecord } from '../usage/loopUsage.js'

/** Zstandard frame magic (little-endian `0xFD2FB528`). */
const ZSTD_MAGIC = 4247762216

export type DshTokenUsageTotals = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  reasoningTokens: number
}

export function resolveDshHome(env: NodeJS.ProcessEnv = process.env, homedir = os.homedir()): string {
  const fromEnv = env.DSH_HOME?.trim()
  if (fromEnv) return fromEnv
  return path.join(homedir, '.dsh')
}

export function dshSessionsRoot(env: NodeJS.ProcessEnv = process.env, homedir = os.homedir()): string {
  return path.join(resolveDshHome(env, homedir), 'sessions')
}

/** Mirrors DSH JSONL persistence `projectKey` (lossy cwd → one directory name). */
export function dshProjectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

export function listDshSessionLogPaths(sessionsRoot: string, cwd: string): string[] {
  const project = path.join(sessionsRoot, dshProjectKey(cwd))
  if (!fs.existsSync(project)) return []
  const logs: string[] = []
  let names: string[]
  try {
    names = fs.readdirSync(project)
  } catch {
    return []
  }
  for (const name of names) {
    const dir = path.join(project, name)
    for (const file of ['session.jsonl.zstd', 'session.jsonl'] as const) {
      const candidate = path.join(dir, file)
      if (fs.existsSync(candidate)) logs.push(candidate)
    }
  }
  return logs
}

export type DshLogSnapshot = {
  size: number
  mtimeMs: number
}

export function snapshotDshSessionLogs(sessionsRoot: string, cwd: string): Map<string, DshLogSnapshot> {
  const snap = new Map<string, DshLogSnapshot>()
  for (const filePath of listDshSessionLogPaths(sessionsRoot, cwd)) {
    try {
      const st = fs.statSync(filePath)
      snap.set(filePath, { size: st.size, mtimeMs: st.mtimeMs })
    } catch {
      // vanished between readdir and stat
    }
  }
  return snap
}

/** Prefer a brand-new log; else a pre-existing log that grew (append). Several hits → newest mtime. */
export function pickChangedDshSessionLog(
  before: ReadonlyMap<string, DshLogSnapshot>,
  afterPaths: readonly string[],
): string | undefined {
  const created: string[] = []
  const grown: string[] = []
  for (const filePath of afterPaths) {
    const prev = before.get(filePath)
    if (!prev) {
      created.push(filePath)
      continue
    }
    try {
      const st = fs.statSync(filePath)
      if (st.size > prev.size) grown.push(filePath)
    } catch {
      // skip vanished files
    }
  }
  if (created.length === 1 && grown.length === 0) return created[0]
  if (created.length === 0 && grown.length === 1) return grown[0]
  const candidates = [...created, ...grown]
  if (candidates.length === 0) return undefined
  return newestLogPath(candidates)
}

function newestLogPath(paths: readonly string[]): string | undefined {
  let best: { path: string; mtime: number } | undefined
  for (const filePath of paths) {
    try {
      const mtime = fs.statSync(filePath).mtimeMs
      if (!best || mtime >= best.mtime) best = { path: filePath, mtime }
    } catch {
      // skip vanished files
    }
  }
  return best?.path
}

export function sessionIdFromDshLogPath(logPath: string): string | undefined {
  const parent = path.basename(path.dirname(logPath))
  const match = /^session-(.+)$/.exec(parent)
  return match?.[1]
}

type ZstdFrameRange = { start: number; end: number }

/** Locate complete concatenated Zstandard frames (DSH appends one frame per batch). */
export function scanZstdFrames(buffer: Buffer): ZstdFrameRange[] {
  const frames: ZstdFrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) {
      throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`)
    }
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) {
      throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`)
    }
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) {
        throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`)
      }
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

export function decompressConcatenatedZstd(buffer: Buffer): Buffer {
  const decompress = zlib.zstdDecompressSync
  if (typeof decompress !== 'function') {
    throw new Error('zlib.zstdDecompressSync is required to read DSH session logs (Node 22.15+)')
  }
  const frames = scanZstdFrames(buffer)
  if (frames.length === 0) {
    return decompress(buffer)
  }
  const chunks: Buffer[] = []
  for (const frame of frames) {
    chunks.push(decompress(buffer.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(chunks)
}

export function readDshSessionLogText(logPath: string): string {
  const raw = fs.readFileSync(logPath)
  if (logPath.endsWith('.zstd')) {
    return decompressConcatenatedZstd(raw).toString('utf8')
  }
  return raw.toString('utf8')
}

function asFiniteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

export function sumDshAssistantMessageUsage(jsonl: string): DshTokenUsageTotals {
  const totals: DshTokenUsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    reasoningTokens: 0,
  }
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    if (!parsed || typeof parsed !== 'object') continue
    const row = parsed as { type?: unknown; data?: { usage?: unknown } }
    if (row.type !== 'assistant/message') continue
    const usage = row.data?.usage
    if (!usage || typeof usage !== 'object') continue
    const u = usage as Record<string, unknown>
    totals.inputTokens += asFiniteCount(u.inputTokens)
    totals.outputTokens += asFiniteCount(u.outputTokens)
    totals.cacheReadTokens += asFiniteCount(u.cacheReadTokens)
    totals.reasoningTokens += asFiniteCount(u.reasoningTokens)
  }
  return totals
}

export function dshTotalsHaveTokens(totals: DshTokenUsageTotals): boolean {
  return (
    totals.inputTokens > 0 ||
    totals.outputTokens > 0 ||
    totals.cacheReadTokens > 0 ||
    totals.reasoningTokens > 0
  )
}

export function usageRecordFromDshTotals(input: {
  phase: AgentRunPhase
  model: string
  totals: DshTokenUsageTotals
}): LoopUsageRecord {
  return createUsageRecord({
    phase: input.phase,
    runtime: 'dsh',
    model: input.model,
    inputTokens: input.totals.inputTokens,
    outputTokens: input.totals.outputTokens + input.totals.reasoningTokens,
    cacheReadTokens: input.totals.cacheReadTokens,
  })
}

export function readDshSessionUsage(input: {
  sessionsRoot: string
  cwd: string
  before: ReadonlyMap<string, DshLogSnapshot>
  model: string
  phase: AgentRunPhase
}): { usage: LoopUsageRecord; sessionId?: string; logPath: string } | undefined {
  const after = listDshSessionLogPaths(input.sessionsRoot, input.cwd)
  const logPath = pickChangedDshSessionLog(input.before, after)
  if (!logPath) return undefined
  const jsonl = readDshSessionLogText(logPath)
  const totals = sumDshAssistantMessageUsage(jsonl)
  if (!dshTotalsHaveTokens(totals)) return undefined
  return {
    usage: usageRecordFromDshTotals({
      phase: input.phase,
      model: input.model,
      totals,
    }),
    sessionId: sessionIdFromDshLogPath(logPath),
    logPath,
  }
}

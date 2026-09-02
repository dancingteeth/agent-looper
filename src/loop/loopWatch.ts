import fs from 'node:fs'
import path from 'node:path'

export type WatchPhase = 'GOAL' | 'WORKER' | 'VERIFY' | 'JUDGE'

export type WatchStatus = {
  phase: WatchPhase
  iteration: number
  maxIterations: number
  elapsedMs: number
  costUsd: number
  costSource?: 'provider' | 'estimated'
  /** Live file is present but the `run` pid is gone (crash / kill). */
  ended?: boolean
}

/** Hy3-scale spend is millicents; two decimals would print `$0.00`. */
export function formatWatchCostUsd(costUsd: number): string {
  if (costUsd > 0 && costUsd < 0.01) return `$${costUsd.toFixed(4)}`
  return `$${costUsd.toFixed(2)}`
}

/** Structured, always-on progress line (`[agent-loop] phase=WORKER iteration=1/8 elapsed=12s cost~$0.04`). */
export function formatWatchStatusLine(status: WatchStatus): string {
  const elapsedSeconds = Math.round(status.elapsedMs / 1000)
  return (
    `[agent-loop] phase=${status.phase} iteration=${status.iteration}/${status.maxIterations} ` +
    `elapsed=${elapsedSeconds}s cost~${formatWatchCostUsd(status.costUsd)}`
  )
}

const HEARTBEAT_PHASES: readonly WatchPhase[] = ['WORKER', 'JUDGE']

export type WatchHeartbeatOptions = {
  /** Clock source; injectable so tests can fake elapsed time. Defaults to Date.now. */
  now?: () => number
  /** Heartbeat cadence in ms. Defaults to 15s. */
  intervalMs?: number
  /** Line sink; defaults to console.error. */
  emit?: (line: string) => void
}

/**
 * Emits a phase line immediately on every phase change and repeats a heartbeat
 * line every `intervalMs` while the phase is WORKER or JUDGE (long-running
 * stages). Elapsed time is recomputed from the injected clock on each tick.
 */
export class WatchHeartbeat {
  private readonly now: () => number
  private readonly intervalMs: number
  private readonly emit: (line: string) => void
  private timer: ReturnType<typeof setInterval> | undefined
  private current:
    | { phase: WatchPhase; iteration: number; maxIterations: number; costUsd: number; startedAtMs: number }
    | undefined

  constructor(options: WatchHeartbeatOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.intervalMs = options.intervalMs ?? 15_000
    this.emit = options.emit ?? ((line) => console.error(line))
  }

  update(input: {
    phase: WatchPhase
    iteration: number
    maxIterations: number
    costUsd: number
    atMs?: number
  }): void {
    this.stop()
    this.current = {
      phase: input.phase,
      iteration: input.iteration,
      maxIterations: input.maxIterations,
      costUsd: input.costUsd,
      startedAtMs: input.atMs ?? this.now(),
    }
    this.emitLine(0)
    if (HEARTBEAT_PHASES.includes(input.phase)) {
      this.timer = setInterval(() => this.tick(), this.intervalMs)
    }
  }

  stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private tick(): void {
    if (!this.current) return
    this.emitLine(this.now() - this.current.startedAtMs)
  }

  private emitLine(elapsedMs: number): void {
    if (!this.current) return
    this.emit(
      formatWatchStatusLine({
        phase: this.current.phase,
        iteration: this.current.iteration,
        maxIterations: this.current.maxIterations,
        elapsedMs,
        costUsd: this.current.costUsd,
      }),
    )
  }
}

export type WatchLogEntry = {
  at?: string
  iteration?: number
  verify?: { complete?: boolean }
  review?: { verdict?: string }
  usage?: { costUsd?: number; phase?: string }
}

export function parseWatchLogLine(line: string): WatchLogEntry | undefined {
  const trimmed = line.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as WatchLogEntry
  } catch {
    return undefined
  }
}

/** Reconstruct the current phase from the most recent on-disk log entry. */
export function deriveWatchPhase(entry: WatchLogEntry | undefined): WatchPhase {
  if (!entry) return 'GOAL'
  if (entry.review?.verdict) return 'JUDGE'
  if (entry.verify?.complete) return 'VERIFY'
  return 'WORKER'
}

export function readWatchSnapshot(
  logPath: string,
  options?: { maxIterations?: number },
): WatchStatus | null {
  let content: string
  try {
    content = fs.readFileSync(logPath, 'utf8')
  } catch {
    return null
  }
  const lines = content
    .split('\n')
    .map(parseWatchLogLine)
    .filter((entry): entry is WatchLogEntry => entry !== undefined)
  if (lines.length === 0) return null

  const first = lines[0]!
  const last = lines[lines.length - 1]!
  const iteration = last.iteration ?? lines.length
  const maxIterations = options?.maxIterations ?? iteration
  const costUsd = lines.reduce((sum, entry) => sum + (entry.usage?.costUsd ?? 0), 0)
  const spanMs = first.at && last.at ? Date.parse(last.at) - Date.parse(first.at) : 0
  const elapsedMs = Number.isFinite(spanMs) && spanMs >= 0 ? spanMs : 0

  return {
    phase: deriveWatchPhase(last),
    iteration,
    maxIterations,
    elapsedMs,
    costUsd,
  }
}

export const WATCH_STATUS_BASENAME = 'watch-status.json'

const WATCH_PHASES: readonly WatchPhase[] = ['GOAL', 'WORKER', 'VERIFY', 'JUDGE']

export type WatchLiveFile = {
  phase: WatchPhase
  iteration: number
  maxIterations: number
  costUsd: number
  phaseStartedAt: string
  /** `run` process id; Watch treats a dead pid as ended, not still-working. */
  pid?: number
}

export function watchStatusPath(loopDir: string): string {
  return path.join(loopDir, WATCH_STATUS_BASENAME)
}

function isWatchPhase(value: unknown): value is WatchPhase {
  return typeof value === 'string' && (WATCH_PHASES as readonly string[]).includes(value)
}

export function readWatchLiveFile(filePath: string): WatchLiveFile | undefined {
  try {
    return parseWatchLiveFile(JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown)
  } catch {
    return undefined
  }
}

function parseWatchLiveFile(raw: unknown): WatchLiveFile | undefined {
  if (raw === null || typeof raw !== 'object') return undefined
  const record = raw as Record<string, unknown>
  if (!isWatchPhase(record.phase)) return undefined
  if (typeof record.iteration !== 'number' || !Number.isFinite(record.iteration)) return undefined
  if (typeof record.maxIterations !== 'number' || !Number.isFinite(record.maxIterations)) {
    return undefined
  }
  if (typeof record.costUsd !== 'number' || !Number.isFinite(record.costUsd)) return undefined
  if (typeof record.phaseStartedAt !== 'string' || record.phaseStartedAt.length === 0) {
    return undefined
  }
  let pid: number | undefined
  if (record.pid !== undefined) {
    if (typeof record.pid !== 'number' || !Number.isInteger(record.pid) || record.pid <= 0) {
      return undefined
    }
    pid = record.pid
  }
  return {
    phase: record.phase,
    iteration: record.iteration,
    maxIterations: record.maxIterations,
    costUsd: record.costUsd,
    phaseStartedAt: record.phaseStartedAt,
    pid,
  }
}

/** `kill(pid, 0)` — exists and is visible to this user. */
export function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function writeWatchStatus(filePath: string, live: WatchLiveFile): void {
  const tmp = `${filePath}.${process.pid}.tmp`
  const payload: WatchLiveFile = { ...live, pid: live.pid ?? process.pid }
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tmp, filePath)
}

/** Best-effort: drop the live file so Watch does not keep a finished run as current. */
export function clearWatchStatus(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // missing file is the success case
  }
}

export function liveFileToStatus(live: WatchLiveFile, nowMs: number = Date.now()): WatchStatus {
  const started = Date.parse(live.phaseStartedAt)
  const elapsedMs = Number.isFinite(started) ? Math.max(0, nowMs - started) : 0
  return {
    phase: live.phase,
    iteration: live.iteration,
    maxIterations: live.maxIterations,
    elapsedMs,
    costUsd: live.costUsd,
  }
}

export function readWatchLiveStatus(
  filePath: string,
  nowMs: number = Date.now(),
  options?: { isAlive?: (pid: number) => boolean },
): WatchStatus | null {
  let content: string
  let mtimeMs: number | undefined
  try {
    content = fs.readFileSync(filePath, 'utf8')
    mtimeMs = fs.statSync(filePath).mtimeMs
  } catch {
    return null
  }
  try {
    const live = parseWatchLiveFile(JSON.parse(content) as unknown)
    if (!live) return null
    const isAlive = options?.isAlive ?? processIsAlive
    const runAlive = live.pid !== undefined && isAlive(live.pid)
    if (!runAlive) {
      const freezeMs = mtimeMs !== undefined && Number.isFinite(mtimeMs) ? mtimeMs : nowMs
      return { ...liveFileToStatus(live, freezeMs), ended: true }
    }
    return liveFileToStatus(live, nowMs)
  } catch {
    return null
  }
}

/** Prefer the live phase file from `run`; fall back to the last `log.ndjson` line. */
export function readWatchView(
  loopDir: string,
  options?: {
    maxIterations?: number
    nowMs?: number
    isAlive?: (pid: number) => boolean
  },
): WatchStatus | null {
  const live = readWatchLiveStatus(watchStatusPath(loopDir), options?.nowMs, {
    isAlive: options?.isAlive,
  })
  if (live) {
    if (options?.maxIterations !== undefined) {
      return { ...live, maxIterations: options.maxIterations }
    }
    return live
  }
  return readWatchSnapshot(path.join(loopDir, 'log.ndjson'), options)
}

import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const GRIND_LOG = 'opencode-grind.log'
export const GRIND_PID = 'opencode-grind.pid'
const DONE_PREFIX = 'AGENT_LOOP_DONE '
const RUN_REPORT = 'run-report.md'
const LOG_TAIL_LINES = 40

export type StartResult = { ok: true; pid: number; logPath: string; command: string } | { ok: false; error: string }

export type SpawnFn = typeof spawn

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM: exists but owned by someone else — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function readGrindPid(loopDir: string): number | undefined {
  try {
    const pid = Number.parseInt(fs.readFileSync(path.join(loopDir, GRIND_PID), 'utf8').trim(), 10)
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

/** Prefer the repo-local bin (`pnpm add -D`), else whatever `agent-loop` is on PATH. */
export function resolveAgentLoopBinary(worktree: string, configured?: string): string {
  if (configured) return configured
  const local = path.join(worktree, 'node_modules', '.bin', process.platform === 'win32' ? 'agent-loop.cmd' : 'agent-loop')
  return fs.existsSync(local) ? local : 'agent-loop'
}

export function resolveLoopDir(directory: string, loopDir: string): string {
  return path.resolve(directory, loopDir)
}

export function startGrind(input: {
  directory: string
  worktree: string
  loopDir: string
  extraArgs?: string[]
  binary?: string
  spawnImpl?: SpawnFn
}): StartResult {
  const loopDir = resolveLoopDir(input.directory, input.loopDir)
  for (const required of ['GOAL.md', 'loop.json']) {
    if (!fs.existsSync(path.join(loopDir, required))) {
      return { ok: false, error: `${loopDir} has no ${required}. Freeze the bundle first (skill design-loop).` }
    }
  }

  const previous = readGrindPid(loopDir)
  if (previous !== undefined && isAlive(previous)) {
    return {
      ok: false,
      error: `A grind is already running for ${loopDir} (pid ${previous}). Use agent_loop_status. If that pid is not agent-loop, delete ${GRIND_PID}.`,
    }
  }

  const binary = resolveAgentLoopBinary(input.worktree, input.binary)
  const args = ['run', loopDir, ...(input.extraArgs ?? [])]
  const logPath = path.join(loopDir, GRIND_LOG)
  const logFd = fs.openSync(logPath, 'w')
  try {
    const child = (input.spawnImpl ?? spawn)(binary, args, {
      cwd: input.worktree,
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    })
    // ENOENT surfaces as an async 'error' event; without a listener it would crash the OpenCode host.
    child.on('error', () => undefined)
    if (child.pid === undefined) {
      return { ok: false, error: `Could not start ${binary}. Install @dancingteeth/agent-looper (skill run-loop-in-opencode).` }
    }
    child.unref()
    fs.writeFileSync(path.join(loopDir, GRIND_PID), `${child.pid}\n`)
    return { ok: true, pid: child.pid, logPath, command: [binary, ...args].join(' ') }
  } finally {
    fs.closeSync(logFd)
  }
}

export function tailLines(text: string, count: number): string {
  return text.split(/\r?\n/).filter(Boolean).slice(-count).join('\n')
}

export function grindStatus(input: { directory: string; loopDir: string }): string {
  const loopDir = resolveLoopDir(input.directory, input.loopDir)
  const pid = readGrindPid(loopDir)
  let log = ''
  try {
    log = fs.readFileSync(path.join(loopDir, GRIND_LOG), 'utf8')
  } catch {
    // no grind started from OpenCode for this dir
  }

  const doneLine = log.split(/\r?\n/).find((line) => line.startsWith(DONE_PREFIX))
  const state = doneLine
    ? describeDone(doneLine.slice(DONE_PREFIX.length).trim())
    : pid === undefined
      ? 'not started from OpenCode'
      : isAlive(pid)
        ? `running (pid ${pid})`
        : describeExitWithoutSignal(loopDir, pid)

  return [`loop: ${loopDir}`, `state: ${state}`, log ? `--- last ${LOG_TAIL_LINES} log lines ---\n${tailLines(log, LOG_TAIL_LINES)}` : '']
    .filter(Boolean)
    .join('\n')
}

/** `AGENT_LOOP_DONE {json}` → success vs failure; the line alone only means the harness exited. */
export function describeDone(payload: string): string {
  try {
    const signal = JSON.parse(payload) as { complete?: unknown; exitCode?: unknown; reason?: unknown; runReport?: unknown }
    const verdict = signal.complete === true ? 'done: complete' : 'done: NOT complete'
    const details = [
      `exitCode ${String(signal.exitCode)}`,
      typeof signal.reason === 'string' ? `reason: ${signal.reason}` : undefined,
      typeof signal.runReport === 'string' ? `report: ${signal.runReport}` : undefined,
    ].filter(Boolean)
    return `${verdict} (${details.join('; ')})`
  } catch {
    return `done (unparsed signal: ${payload})`
  }
}

/** Completion signal can be off (`completionSignal: false` / env), so a fresh run-report means it finished. */
function describeExitWithoutSignal(loopDir: string, pid: number): string {
  try {
    const startedAt = fs.statSync(path.join(loopDir, GRIND_PID)).mtimeMs
    if (fs.statSync(path.join(loopDir, RUN_REPORT)).mtimeMs >= startedAt) {
      return `exited (pid ${pid}; no ${DONE_PREFIX.trim()} line — completion signal off? read ${RUN_REPORT})`
    }
  } catch {
    // no run report: fall through
  }
  return `dead (pid ${pid} exited without ${DONE_PREFIX.trim()} or a new ${RUN_REPORT})`
}

/** Runtime-agnostic heartbeat (`ps` + watch-status.json) from the shared check-running-loops skill. */
export async function heartbeat(input: { skillsDir: string; worktree: string }): Promise<string | undefined> {
  const script = path.join(input.skillsDir, 'check-running-loops', 'scripts', 'check-running-loops.sh')
  if (!fs.existsSync(script)) return undefined
  // Async: a tool runs inside the shared OpenCode server, so spawnSync would stall every session.
  return new Promise((resolve) => {
    execFile('sh', [script, input.worktree], { encoding: 'utf8', timeout: 30_000 }, (_err, stdout, stderr) => {
      resolve(`${stdout ?? ''}${stderr ?? ''}`.trim() || undefined)
    })
  })
}

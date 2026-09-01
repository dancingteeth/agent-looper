import { spawn, spawnSync, type ChildProcess } from 'node:child_process'

export const PROCESS_TREE_KILL_GRACE_MS = 3000

export type ProcessTreeIo = {
  listChildren: (pid: number) => number[]
  kill: (pid: number, signal: NodeJS.Signals) => void
  alive: (pid: number) => boolean
}

const trackedRoots = new Set<number>()
let signalHandlersInstalled = false

export function defaultProcessTreeIo(): ProcessTreeIo {
  return {
    listChildren: listChildPids,
    kill: (pid, signal) => {
      process.kill(pid, signal)
    },
    alive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch {
        return false
      }
    },
  }
}

/** Direct children via `pgrep -P`. Empty on win32 (use taskkill /T instead). */
export function listChildPids(pid: number): number[] {
  if (pid <= 0 || process.platform === 'win32') return []
  const out = spawnSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' })
  if (!out.stdout) return []
  return out.stdout
    .split('\n')
    .map((tok) => Number.parseInt(tok, 10))
    .filter((child) => Number.isFinite(child) && child > 0)
}

export function collectDescendantPids(
  rootPid: number,
  listChildren: (pid: number) => number[] = listChildPids,
): number[] {
  if (rootPid <= 0) return []
  const seen = new Set<number>()
  const queue = [rootPid]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    for (const child of listChildren(current)) {
      if (child === rootPid || seen.has(child) || child <= 0) continue
      seen.add(child)
      queue.push(child)
    }
  }
  return [...seen]
}

/** POSIX: `detached` spawn makes `pid` a process-group leader; `-pid` kills the group. */
export function killProcessGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (pid === undefined || pid <= 0) return
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

export function signalProcessTree(
  rootPid: number | undefined,
  signal: NodeJS.Signals,
  io: ProcessTreeIo = defaultProcessTreeIo(),
): void {
  if (rootPid === undefined || rootPid <= 0) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(rootPid), '/T', '/F'], { windowsHide: true })
    return
  }
  const pids = [rootPid, ...collectDescendantPids(rootPid, io.listChildren)]
  for (const pid of [...new Set(pids)].reverse()) {
    try {
      io.kill(pid, signal)
    } catch {
      // already gone
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    handle.unref?.()
  })
}

/**
 * SIGTERM the subtree (shim, serve, MCP), wait up to graceMs, then SIGKILL leftovers.
 * Also tries process-group kill when `rootPid` is a group leader (detached spawn).
 */
export async function killProcessTree(
  rootPid: number | undefined,
  options: {
    graceMs?: number
    io?: ProcessTreeIo
    delay?: (ms: number) => Promise<void>
  } = {},
): Promise<void> {
  if (rootPid === undefined || rootPid <= 0) return
  const graceMs = options.graceMs ?? PROCESS_TREE_KILL_GRACE_MS
  const io = options.io ?? defaultProcessTreeIo()
  const delay = options.delay ?? sleep

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(rootPid), '/T', '/F'], { windowsHide: true })
    return
  }

  killProcessGroup(rootPid, 'SIGTERM')
  signalProcessTree(rootPid, 'SIGTERM', io)

  const deadline = Date.now() + graceMs
  while (Date.now() < deadline) {
    const still = [rootPid, ...collectDescendantPids(rootPid, io.listChildren)].filter((pid) =>
      io.alive(pid),
    )
    if (still.length === 0) return
    await delay(Math.min(50, deadline - Date.now()))
  }

  killProcessGroup(rootPid, 'SIGKILL')
  signalProcessTree(rootPid, 'SIGKILL', io)
}

export function trackSpawnedRoot(pid: number | undefined): () => void {
  if (pid === undefined || pid <= 0) return () => undefined
  trackedRoots.add(pid)
  installSpawnedProcessSignalHandlers()
  return () => {
    trackedRoots.delete(pid)
  }
}

export function trackedSpawnedRoots(): readonly number[] {
  return [...trackedRoots]
}

/** Skip in Vitest so SIGINT handlers cannot `process.exit` the test runner. */
export function shouldInstallProcessSignalHandlers(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.VITEST !== 'true' && env.NODE_ENV !== 'test'
}

export function installSpawnedProcessSignalHandlers(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (signalHandlersInstalled) return
  if (!shouldInstallProcessSignalHandlers(env)) return
  signalHandlersInstalled = true
  const onSignal = (signal: NodeJS.Signals) => {
    void reapTrackedRootsAndExit(signal)
  }
  process.once('SIGINT', onSignal)
  process.once('SIGTERM', onSignal)
}

async function reapTrackedRootsAndExit(signal: NodeJS.Signals): Promise<void> {
  const roots = [...trackedRoots]
  trackedRoots.clear()
  await Promise.allSettled(roots.map((pid) => killProcessTree(pid)))
  const code = signal === 'SIGINT' ? 130 : 143
  process.exit(code)
}

/**
 * POSIX watcher: when `parentPid` dies, SIGTERM/SIGKILL `rootPid` and descendants.
 * Survives a SIGKILL of the harness Node process (Cursor Agent Shell reap).
 */
export const PARENT_DEATH_REAPER_SCRIPT = `
parent="$1"
root="$2"
while kill -0 "$parent" 2>/dev/null; do
  sleep 1
done
if ! kill -0 "$root" 2>/dev/null; then
  exit 0
fi
collect() {
  printf '%s\\n' "$1"
  for child in $(pgrep -P "$1" 2>/dev/null); do
    [ -n "$child" ] && collect "$child"
  done
}
pids=$(collect "$root")
for pid in $pids; do
  kill -TERM "$pid" 2>/dev/null || true
done
kill -TERM -"$root" 2>/dev/null || true
sleep 2
for pid in $pids; do
  kill -KILL "$pid" 2>/dev/null || true
done
kill -KILL -"$root" 2>/dev/null || true
`.trim()

export function spawnParentDeathReaper(input: {
  parentPid: number
  rootPid: number
  spawnImpl?: (
    command: string,
    args: readonly string[],
    options: { detached: boolean; stdio: 'ignore' },
  ) => ChildProcess
}): { pid: number | undefined; close: () => void } {
  if (process.platform === 'win32' || input.rootPid <= 0 || input.parentPid <= 0) {
    return { pid: undefined, close: () => undefined }
  }
  const spawnImpl = input.spawnImpl ?? spawn
  const child = spawnImpl(
    'sh',
    ['-c', PARENT_DEATH_REAPER_SCRIPT, 'agent-loop-reaper', String(input.parentPid), String(input.rootPid)],
    { detached: true, stdio: 'ignore' },
  )
  child.unref?.()
  return {
    pid: child.pid,
    close: () => {
      killProcessGroup(child.pid, 'SIGKILL')
    },
  }
}

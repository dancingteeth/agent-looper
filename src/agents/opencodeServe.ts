import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { killProcessTree } from './processTree.js'

export type OpencodeServeConfig = Record<string, unknown>

export type StartedOpencodeServe = {
  url: string
  pid: number | undefined
  close: () => Promise<void>
}

export type SpawnOpencodeServeFn = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string
    env: NodeJS.ProcessEnv
    stdio: ['ignore', 'pipe', 'pipe']
    detached: boolean
  },
) => ChildProcess

export function packageRootFromModuleUrl(moduleUrl: string = import.meta.url): string {
  const here = path.dirname(fileURLToPath(moduleUrl))
  return path.resolve(here, '../..')
}

/** Prefer local node_modules/.bin so `opencode` resolves without a global install. */
export function pathWithLocalOpencodeBins(
  repoRoot: string,
  packageRoot = packageRootFromModuleUrl(),
): string {
  const bins = [
    path.join(repoRoot, 'node_modules', '.bin'),
    path.join(packageRoot, 'node_modules', '.bin'),
  ]
  const existing = process.env.PATH ?? ''
  return [...bins, existing].join(path.delimiter)
}

/**
 * Prefer `opencode.exe` (real binary) over the pnpm `.bin/opencode` shell shim.
 * SDK `proc.kill()` only SIGTERMs the shim; the serve + MCP children survive as PID-1 orphans.
 */
export function resolveOpencodeExecutable(input: {
  repoRoot: string
  packageRoot?: string
  pathEnv?: string
  exists?: (filePath: string) => boolean
}): string {
  const exists = input.exists ?? ((filePath: string) => fs.existsSync(filePath))
  const packageRoot = input.packageRoot ?? packageRootFromModuleUrl()
  // npm package ships `bin/opencode.exe` on darwin/linux too (not a Windows-only name).
  const exeName = 'opencode.exe'
  const candidates = [
    path.join(input.repoRoot, 'node_modules', 'opencode-ai', 'bin', exeName),
    path.join(packageRoot, 'node_modules', 'opencode-ai', 'bin', exeName),
  ]
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate
  }

  const pathEnv = input.pathEnv ?? process.env.PATH ?? ''
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue
    const exe = path.join(dir, exeName)
    if (exists(exe)) return exe
    const shim = path.join(dir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode')
    if (exists(shim)) return shim
  }
  return 'opencode'
}

function parseServeUrl(line: string): string | undefined {
  if (!line.startsWith('opencode server listening')) return undefined
  const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
  return match?.[1]
}

export async function startOpencodeServe(input: {
  hostname: string
  port: number
  timeoutMs: number
  config: OpencodeServeConfig
  cwd: string
  env?: NodeJS.ProcessEnv
  command?: string
  spawnImpl?: SpawnOpencodeServeFn
  killTree?: (pid: number | undefined) => Promise<void>
}): Promise<StartedOpencodeServe> {
  const command = input.command ?? resolveOpencodeExecutable({ repoRoot: input.cwd })
  const args = [`serve`, `--hostname=${input.hostname}`, `--port=${input.port}`]
  const spawnImpl = input.spawnImpl ?? (spawn as SpawnOpencodeServeFn)
  const killTree = input.killTree ?? killProcessTree
  const proc = spawnImpl(command, args, {
    cwd: input.cwd,
    env: {
      ...input.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(input.config),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  const url = await new Promise<string>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let settled = false
    const finish = (action: () => void) => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      action()
    }
    timeoutId = setTimeout(() => {
      void (async () => {
        try {
          await killTree(proc.pid)
        } finally {
          finish(() => {
            reject(new Error(`Timeout waiting for OpenCode server to start after ${input.timeoutMs}ms`))
          })
        }
      })()
    }, input.timeoutMs)
    timeoutId.unref?.()

    let output = ''

    const onChunk = (chunk: Buffer) => {
      if (settled) return
      output += chunk.toString()
      for (const line of output.split('\n')) {
        const parsed = parseServeUrl(line)
        if (!parsed) continue
        finish(() => resolve(parsed))
        return
      }
    }

    proc.stdout?.on('data', onChunk)
    proc.stderr?.on('data', onChunk)

    const fail = (err: Error) => {
      finish(() => reject(err))
    }

    proc.on('exit', (code) => {
      let msg = `OpenCode server exited with code ${code}`
      if (output.trim()) msg += `\nServer output: ${output}`
      fail(new Error(msg))
    })
    proc.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error)
      fail(new Error(`Failed to spawn OpenCode server (${message})`))
    })
  })

  return {
    url,
    pid: proc.pid,
    close: async () => {
      await killTree(proc.pid)
    },
  }
}

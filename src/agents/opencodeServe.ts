import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
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

export async function reserveFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Failed to reserve a free port for OpenCode server'))
        return
      }
      const { port } = address
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

/** Major version of an `opencode` binary (`opencode v2.0.32` / `1.18.15`), or undefined. */
export function parseOpencodeMajorVersion(output: string): number | undefined {
  const match = output.match(/(\d+)\.\d+\.\d+/)
  return match ? Number(match[1]) : undefined
}

export function detectOpencodeMajorVersion(command: string, env?: NodeJS.ProcessEnv): number | undefined {
  const result = spawnSync(command, ['--version'], { encoding: 'utf8', env, timeout: 15_000 })
  if (result.error || result.status !== 0) return undefined
  return parseOpencodeMajorVersion(`${result.stdout ?? ''}${result.stderr ?? ''}`)
}

/** v1 prints `opencode server listening on …`; v2 prints `server listening on …`. */
export function parseServeUrl(line: string): string | undefined {
  if (!/^(opencode )?server listening/.test(line)) return undefined
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
  /** v2 only: Basic-auth password (username `opencode`) instead of a random one printed to stdout. */
  password?: string
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
      ...(input.password ? { OPENCODE_PASSWORD: input.password } : {}),
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

/**
 * Start a throwaway serve and make one authenticated API call with the client that matches the
 * CLI major. `--version` alone passes even when the SDK and server speak different APIs.
 */
export async function probeOpencodeServeHandshake(input: {
  command: string
  major: number
  cwd: string
  env: NodeJS.ProcessEnv
}): Promise<void> {
  const port = await reserveFreePort()
  const password = input.major >= 2 ? randomBytes(24).toString('base64url') : undefined
  const server = await startOpencodeServe({
    hostname: '127.0.0.1',
    port,
    timeoutMs: 30_000,
    config: { autoupdate: false },
    cwd: input.cwd,
    env: input.env,
    command: input.command,
    password,
  })
  try {
    if (input.major >= 2) {
      const { OpenCode } = await import('@opencode/client')
      const client = OpenCode.make({
        baseUrl: server.url,
        headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
      })
      await client.server.info()
    } else {
      const { createOpencodeClient } = await import('@opencode-ai/sdk')
      const result = await createOpencodeClient({ baseUrl: server.url, directory: input.cwd }).session.list()
      if (result.error) throw new Error(`session.list failed: ${JSON.stringify(result.error)}`)
    }
  } finally {
    // killProcessTree polls with unref'd timers; in a short-lived CLI nothing else holds the loop.
    const keepAlive = setInterval(() => undefined, 1_000)
    await server.close().finally(() => clearInterval(keepAlive))
  }
}

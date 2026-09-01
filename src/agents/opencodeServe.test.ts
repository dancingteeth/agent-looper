import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { resolveOpencodeExecutable, startOpencodeServe } from './opencodeServe.js'

describe('resolveOpencodeExecutable', () => {
  it('prefers repo opencode.exe over the PATH shim', () => {
    const resolved = resolveOpencodeExecutable({
      repoRoot: '/repo',
      packageRoot: '/pkg',
      pathEnv: '/usr/bin',
      exists: (filePath) => filePath === '/repo/node_modules/opencode-ai/bin/opencode.exe',
    })
    expect(resolved).toBe('/repo/node_modules/opencode-ai/bin/opencode.exe')
  })

  it('falls back to PATH opencode when no exe is installed', () => {
    const resolved = resolveOpencodeExecutable({
      repoRoot: '/repo',
      packageRoot: '/pkg',
      pathEnv: '/usr/bin',
      exists: (filePath) => filePath === '/usr/bin/opencode',
    })
    expect(resolved).toBe('/usr/bin/opencode')
  })
})

describe('startOpencodeServe', () => {
  it('resolves the listen URL and spawns detached', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 4242
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    let spawnOpts: { detached?: boolean } | undefined
    const started = startOpencodeServe({
      hostname: '127.0.0.1',
      port: 4096,
      timeoutMs: 5_000,
      config: { autoupdate: false },
      cwd: '/repo',
      env: { PATH: '/bin' },
      command: '/repo/opencode.exe',
      spawnImpl: (_cmd, _args, options) => {
        spawnOpts = options
        return child as unknown as ChildProcess
      },
    })

    child.stdout.write('opencode server listening on http://127.0.0.1:4096\n')
    const server = await started
    expect(server.url).toBe('http://127.0.0.1:4096')
    expect(server.pid).toBe(4242)
    expect(spawnOpts?.detached).toBe(true)
  })

  it('rejects when the process exits before listen', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 7
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const started = startOpencodeServe({
      hostname: '127.0.0.1',
      port: 4096,
      timeoutMs: 5_000,
      config: {},
      cwd: '/repo',
      command: 'opencode',
      spawnImpl: () => child as unknown as ChildProcess,
    })

    child.emit('exit', 1)
    await expect(started).rejects.toThrow(/exited with code 1/)
  })

  it('awaits killTree before rejecting on listen timeout', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 99
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const order: string[] = []
    const started = startOpencodeServe({
      hostname: '127.0.0.1',
      port: 4096,
      timeoutMs: 20,
      config: {},
      cwd: '/repo',
      command: 'opencode',
      spawnImpl: () => child as unknown as ChildProcess,
      killTree: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30))
        order.push('killed')
      },
    })

    await expect(started).rejects.toThrow(/Timeout waiting for OpenCode server/)
    order.push('rejected')
    expect(order).toEqual(['killed', 'rejected'])
  })
})

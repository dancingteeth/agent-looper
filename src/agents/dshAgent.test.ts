import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loopConfigSchema } from '../loop/loopConfig.js'
import {
  DSH_LOOP_PERMISSION_PRESET,
  buildDshLoopPatchYaml,
  killProcessGroup,
  nodeMeetsDshMinimum,
  spawnDshHeadless,
} from './dshAgent.js'

describe('dshAgent', () => {
  it('writes a headless patch for model, never-approval, and a matching permission preset', () => {
    const yaml = buildDshLoopPatchYaml('/repo', 'deepseek-official/deepseek-v4-flash')
    expect(yaml).toContain('id: agent-default-model')
    expect(yaml).toContain('provider: "deepseek-official"')
    expect(yaml).toContain('model: "deepseek-v4-flash"')
    expect(yaml).toContain('id: approval')
    expect(yaml).toContain('policy: never')
    expect(yaml).toContain('mode: workspace-write')
    expect(yaml).toContain('workspaceRoot: "/repo"')
    expect(yaml).toContain('id: permission')
    expect(yaml).toContain(`defaultPreset: ${DSH_LOOP_PERMISSION_PRESET}`)
    expect(yaml).toContain(`sandbox: workspace-write`)
    expect(yaml).toMatch(new RegExp(`${DSH_LOOP_PERMISSION_PRESET}:\\n\\s+sandbox: workspace-write\\n\\s+approval: never`))
    expect(yaml).not.toContain('inputModalities')
  })

  it('declares image input on the vision catalog row for headless read_image', () => {
    const yaml = buildDshLoopPatchYaml(
      '/repo',
      'deepseek-official/deepseek-v4-flash-vision-exp',
    )
    expect(yaml).toContain('id: llm-deepseek')
    expect(yaml).toContain('model: "deepseek-v4-flash-vision-exp"')
    expect(yaml).toContain('id: "deepseek-v4-flash-vision-exp"')
    expect(yaml).toContain('inputModalities: [text, image]')
    expect(yaml).toContain('id: "deepseek-v4-flash"')
    expect(yaml).toContain('id: "deepseek-v4-pro"')
  })

  it('requires Node 22.15+', () => {
    expect(nodeMeetsDshMinimum('22.14.0')).toBe(false)
    expect(nodeMeetsDshMinimum('22.15.0')).toBe(true)
    expect(nodeMeetsDshMinimum('23.0.0')).toBe(true)
  })
})

describe('killProcessGroup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signals the process-group leader as -pid', () => {
    const seen: number[] = []
    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      seen.push(pid)
      return true
    }) as typeof process.kill)
    killProcessGroup(4242, 'SIGTERM')
    expect(seen[0]).toBe(-4242)
  })

  it('falls back to the raw pid when group kill fails', () => {
    const seen: number[] = []
    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid < 0) throw new Error('ESRCH')
      seen.push(pid)
      return true
    }) as typeof process.kill)
    killProcessGroup(7, 'SIGKILL')
    expect(seen).toEqual([7])
  })
})

describe('spawnDshHeadless', () => {
  const noopReaper = () => ({ pid: undefined, close: () => undefined })

  it('SIGTERMs the process group on timeout, then rejects after close', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 4242
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const kills: Array<[number | undefined, NodeJS.Signals]> = []
    const trees: Array<[number | undefined, NodeJS.Signals]> = []
    const run = spawnDshHeadless({
      repoRoot: '/repo',
      patchPath: '/tmp/p.yml',
      task: 'hi',
      timeoutMs: 20,
      killGraceMs: 50,
      spawnImpl: () => child as unknown as ChildProcess,
      killGroup: (pid, signal) => {
        kills.push([pid, signal])
      },
      signalTree: (pid, signal) => {
        trees.push([pid, signal])
      },
      spawnReaper: noopReaper,
    })

    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(kills[0]).toEqual([4242, 'SIGTERM'])
    expect(trees[0]).toEqual([4242, 'SIGTERM'])
    child.emit('close', 1)
    await expect(run).rejects.toThrow(/timed out after 20ms/)
  })

  it('resolves stdout on exit 0 without a timeout', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 1
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const run = spawnDshHeadless({
      repoRoot: '/repo',
      patchPath: '/tmp/p.yml',
      task: 'hi',
      timeoutMs: 5_000,
      spawnImpl: () => child as unknown as ChildProcess,
      killGroup: () => {
        throw new Error('should not kill')
      },
      signalTree: () => {
        throw new Error('should not kill tree')
      },
      spawnReaper: noopReaper,
    })

    child.stdout.write('assistant done')
    child.emit('close', 0)
    await expect(run).resolves.toMatchObject({ stdout: 'assistant done', exitCode: 0 })
  })

  it('ignores exit until close so piped stdout can drain', async () => {
    const child = new EventEmitter() as EventEmitter & {
      pid: number
      stdout: PassThrough
      stderr: PassThrough
    }
    child.pid = 1
    child.stdout = new PassThrough()
    child.stderr = new PassThrough()

    const run = spawnDshHeadless({
      repoRoot: '/repo',
      patchPath: '/tmp/p.yml',
      task: 'hi',
      timeoutMs: 5_000,
      spawnImpl: () => child as unknown as ChildProcess,
      killGroup: () => {
        throw new Error('should not kill')
      },
      signalTree: () => {
        throw new Error('should not kill tree')
      },
      spawnReaper: noopReaper,
    })

    child.stdout.write('late chunk')
    child.emit('exit', 0)
    const early = await Promise.race([
      run.then(() => 'resolved' as const),
      new Promise<'pending'>((resolve) => {
        setTimeout(() => resolve('pending'), 25)
      }),
    ])
    expect(early).toBe('pending')
    child.emit('close', 0)
    await expect(run).resolves.toMatchObject({ stdout: 'late chunk', exitCode: 0 })
  })
})

describe('loop.json runtime dsh', () => {
  it('defaults worker Flash and review Pro when reviewRuntime is dsh', () => {
    const config = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'dsh',
      reviewRuntime: 'dsh',
    })
    expect(config.runtime).toBe('dsh')
    expect(config.reviewRuntime).toBe('dsh')
  })
})

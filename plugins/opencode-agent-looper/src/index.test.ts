import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import * as entry from './index.js'
import { FOREGROUND_RUN_DENIAL, foregroundRunReason } from './guard.js'
import { createAgentLooperHooks } from './plugin.js'
import { formatLoopCompletionSignalLine } from '../../../src/integrations/loopCompletionSignal.js'
import { describeDone, GRIND_LOG, GRIND_PID, grindStatus, startGrind, type SpawnFn } from './run.js'
import { defaultSkillsDir, discoverSkills, parseSkillFile } from './skills.js'
import { setupV2, type V2Context } from './v2.js'

const tmpDirs: string[] = []
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

function loopBundle(): { repo: string; loopDir: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-looper-'))
  tmpDirs.push(repo)
  const loopDir = path.join(repo, '.cursor/loops/demo')
  fs.mkdirSync(loopDir, { recursive: true })
  fs.writeFileSync(path.join(loopDir, 'GOAL.md'), '# goal\n')
  fs.writeFileSync(path.join(loopDir, 'loop.json'), '{"verify":"true"}\n')
  return { repo, loopDir }
}

function fakeSpawn(pid: number | undefined, calls: Array<{ cmd: string; args: readonly string[] }>): SpawnFn {
  return ((cmd: string, args: readonly string[]) => {
    calls.push({ cmd, args })
    const child = Object.assign(new EventEmitter(), { pid, unref: () => undefined })
    return child
  }) as unknown as SpawnFn
}

const toolCtx = (directory: string) => ({ directory, worktree: directory }) as never

describe('entry module', () => {
  it('default-exports one module for both hosts and nothing else (1.x calls every named function export)', () => {
    expect(Object.keys(entry)).toEqual(['default'])
    expect(entry.default.id).toBe('agent-looper')
    expect(typeof entry.default.server).toBe('function')
    expect(typeof entry.default.setup).toBe('function')
  })
})

function mockV2Ctx(options: Record<string, unknown> = {}) {
  const skills: Array<{ id: string; name: string }> = []
  const tools: Array<{ name: string; execute: (input: Record<string, unknown>) => Promise<{ content: string }> }> = []
  const hooks: Array<(event: { tool: string; input: unknown }) => void | Promise<void>> = []
  const ctx: V2Context = {
    location: { directory: '/repo', project: { directory: '/repo' } },
    options,
    skill: {
      transform: async (cb) => {
        cb({ get: (id) => skills.find((s) => s.id === id), add: (skill) => skills.push(skill) })
      },
    },
    tool: {
      transform: async (cb) => {
        cb({ add: (tool) => tools.push(tool) })
      },
      hook: async (_name, cb) => {
        hooks.push(cb)
      },
    },
  }
  return { ctx, skills, tools, hooks }
}

describe('setupV2', () => {
  it('registers skills, tools, and the shell guard', async () => {
    const { ctx, skills, tools, hooks } = mockV2Ctx()
    await setupV2(ctx, { env: {} })
    expect(skills.map((s) => s.id)).toContain('run-loop-in-opencode')
    expect(tools.map((t) => t.name).sort()).toEqual(['agent_loop_start', 'agent_loop_status', 'agent_looper_skill'])
    expect(hooks).toHaveLength(1)
    expect(() => hooks[0]({ tool: 'shell', input: { command: 'pnpm exec agent-loop run x' } })).toThrow(/agent_loop_start/)
    expect(hooks[0]({ tool: 'shell', input: { command: 'ls' } })).toBeUndefined()

    const skill = await tools.find((t) => t.name === 'agent_looper_skill')!.execute({ name: 'design-loop' })
    expect(skill.content).toContain('GOAL.md')
  })

  it('keeps only the guard inside harness workers, and honours blockNestedRun: false', async () => {
    const worker = mockV2Ctx()
    await setupV2(worker.ctx, { env: { AGENT_LOOP_WORKER: '1' } })
    expect(worker.tools).toHaveLength(0)
    expect(worker.skills).toHaveLength(0)
    expect(worker.hooks).toHaveLength(1)

    const unguarded = mockV2Ctx({ blockNestedRun: false })
    await setupV2(unguarded.ctx, { env: {} })
    expect(unguarded.hooks).toHaveLength(0)
  })
})

describe('foregroundRunReason', () => {
  it('blocks foreground grind entrypoints in bash', () => {
    for (const command of [
      'pnpm exec agent-loop run .cursor/loops/x',
      'cd repo && agent-loop-batch .cursor/loops',
      'node dist/cli/run.js .cursor/loops/x',
      'npx agent-loop run x --max-iterations 3',
    ]) {
      expect(foregroundRunReason('bash', { command }), command).toBe(FOREGROUND_RUN_DENIAL)
    }
  })

  it('covers the 2.x `shell` tool name', () => {
    expect(foregroundRunReason('shell', { command: 'agent-loop run x' })).toBe(FOREGROUND_RUN_DENIAL)
  })

  it('allows help, other subcommands, and non-bash tools', () => {
    expect(foregroundRunReason('bash', { command: 'pnpm exec agent-loop run --help' })).toBeUndefined()
    expect(foregroundRunReason('bash', { command: 'pnpm exec agent-loop watch --snapshot x' })).toBeUndefined()
    expect(foregroundRunReason('bash', { command: 'pnpm exec agent-loop-init' })).toBeUndefined()
    expect(foregroundRunReason('read', { command: 'agent-loop run x' })).toBeUndefined()
  })
})

describe('skills', () => {
  it('parses frontmatter and ships the OpenCode run skill plus synced shared skills', () => {
    expect(parseSkillFile('x', 'no frontmatter')).toBeUndefined()
    const names = discoverSkills(defaultSkillsDir()).map((s) => s.name)
    expect(names).toContain('run-loop-in-opencode')
    expect(names).toEqual(expect.arrayContaining(['design-loop', 'review-gate', 'check-running-loops']))
  })
})

describe('startGrind / grindStatus', () => {
  it('refuses an unfrozen bundle', () => {
    const { repo, loopDir } = loopBundle()
    fs.rmSync(path.join(loopDir, 'GOAL.md'))
    const result = startGrind({ directory: repo, worktree: repo, loopDir: '.cursor/loops/demo', spawnImpl: fakeSpawn(1, []) })
    expect(result).toMatchObject({ ok: false })
  })

  it('spawns `agent-loop run` detached, records the pid, and refuses a second live grind', () => {
    const { repo, loopDir } = loopBundle()
    const calls: Array<{ cmd: string; args: readonly string[] }> = []
    const result = startGrind({
      directory: repo,
      worktree: repo,
      loopDir: '.cursor/loops/demo',
      extraArgs: ['--max-iterations', '2'],
      spawnImpl: fakeSpawn(process.pid, calls),
    })
    expect(result).toMatchObject({ ok: true, pid: process.pid })
    expect(calls[0]).toEqual({ cmd: 'agent-loop', args: ['run', loopDir, '--max-iterations', '2'] })
    expect(fs.readFileSync(path.join(loopDir, GRIND_PID), 'utf8').trim()).toBe(String(process.pid))

    const again = startGrind({ directory: repo, worktree: repo, loopDir: '.cursor/loops/demo', spawnImpl: fakeSpawn(2, calls) })
    expect(again).toMatchObject({ ok: false })
    expect(calls).toHaveLength(1)
  })

  it('reports a missing binary instead of crashing', () => {
    const { repo } = loopBundle()
    const result = startGrind({ directory: repo, worktree: repo, loopDir: '.cursor/loops/demo', spawnImpl: fakeSpawn(undefined, []) })
    expect(result).toMatchObject({ ok: false })
  })

  it('reads done / running / dead state from the log and pid file', () => {
    const { repo, loopDir } = loopBundle()
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain('not started from OpenCode')

    fs.writeFileSync(path.join(loopDir, GRIND_PID), `${process.pid}\n`)
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain(`running (pid ${process.pid})`)

    fs.writeFileSync(path.join(loopDir, GRIND_PID), '999999\n')
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain('dead')

    const signal = (payload: object) => `iter 1\n${formatLoopCompletionSignalLine(payload as never)}\n`
    fs.writeFileSync(
      path.join(loopDir, GRIND_LOG),
      signal({ v: 1, kind: 'loop', bundle: '.cursor/loops/demo', complete: true, exitCode: 0, reason: 'verify passed' }),
    )
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain(
      'state: done: complete (exitCode 0; reason: verify passed)',
    )

    fs.writeFileSync(
      path.join(loopDir, GRIND_LOG),
      signal({ v: 1, kind: 'loop', bundle: '.cursor/loops/demo', complete: false, exitCode: 1, reason: 'max iterations' }),
    )
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain(
      'state: done: NOT complete (exitCode 1; reason: max iterations)',
    )
  })

  it('treats a fresh run-report as finished when the completion signal is off', () => {
    const { repo, loopDir } = loopBundle()
    fs.writeFileSync(path.join(loopDir, GRIND_PID), '999999\n')
    fs.writeFileSync(path.join(loopDir, GRIND_LOG), 'iter 1\n')
    fs.writeFileSync(path.join(loopDir, 'run-report.md'), '# report\n')
    expect(grindStatus({ directory: repo, loopDir: '.cursor/loops/demo' })).toContain('exited (pid 999999; no AGENT_LOOP_DONE line')
  })

  it('describeDone tolerates an unparseable payload', () => {
    expect(describeDone('not-json')).toBe('done (unparsed signal: not-json)')
  })
})

describe('createAgentLooperHooks', () => {
  it('registers tools, /loop-scaffold, guard, and the system section', async () => {
    const { repo } = loopBundle()
    const hooks = createAgentLooperHooks({ directory: repo, worktree: repo }, {}, { env: {}, spawnImpl: fakeSpawn(process.pid, []) })
    expect(Object.keys(hooks.tool ?? {}).sort()).toEqual(['agent_loop_start', 'agent_loop_status', 'agent_looper_skill'])

    const cfg: { command?: Record<string, { template: string }> } = {}
    await hooks.config?.(cfg as never)
    expect(cfg.command?.['loop-scaffold']?.template).toContain('design-loop')

    const system = { system: [] as string[] }
    await hooks['experimental.chat.system.transform']?.({} as never, system)
    expect(system.system[0]).toContain('agent_loop_start')

    await expect(
      hooks['tool.execute.before']?.({ tool: 'bash', sessionID: 's', callID: 'c' }, { args: { command: 'agent-loop run x' } }),
    ).rejects.toThrow(/agent_loop_start/)

    const skill = await hooks.tool?.agent_looper_skill.execute({ name: 'design-loop' }, toolCtx(repo))
    expect(String(skill)).toContain('GOAL.md')
    const started = await hooks.tool?.agent_loop_start.execute({ loopDir: '.cursor/loops/demo' }, toolCtx(repo))
    expect(String(started)).toContain(`pid: ${process.pid}`)
  })

  it('keeps only the guard inside harness workers', () => {
    const hooks = createAgentLooperHooks({ directory: '/r', worktree: '/r' }, {}, { env: { AGENT_LOOP_WORKER: '1' } })
    expect(Object.keys(hooks)).toEqual(['tool.execute.before'])
  })

  it('blockNestedRun: false disables the guard', async () => {
    const hooks = createAgentLooperHooks({ directory: '/r', worktree: '/r' }, { blockNestedRun: false }, { env: {} })
    await expect(
      hooks['tool.execute.before']?.({ tool: 'bash', sessionID: 's', callID: 'c' }, { args: { command: 'agent-loop run x' } }),
    ).resolves.toBeUndefined()
  })
})

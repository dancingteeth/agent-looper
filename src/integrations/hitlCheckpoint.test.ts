import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFileSync: vi.fn(actual.execFileSync),
  }
})

import { repoProfileSchema } from '../context/repoProfile.js'
import {
  buildHitlBody,
  buildHitlTitle,
  createHitlCheckpoint,
  LINEAR_API_KEY_ENV,
} from './hitlCheckpoint.js'

const mockedExecFileSync = vi.mocked(execFileSync)

const tmpRoots: string[] = []

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  delete process.env[LINEAR_API_KEY_ENV]
  delete process.env.AGENT_LOOP_LINEAR_API_KEY
  vi.unstubAllGlobals()
})

function makeCtx(
  provider: 'file' | 'taskwarrior' | 'github' | 'linear' | 'command' = 'file',
  extras: Record<string, unknown> = {},
) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hitl-ctx-'))
  tmpRoots.push(repoRoot)
  const profile = repoProfileSchema.parse({
    hitlProvider: provider,
    hitlFileDir: '.cursor/hitl',
    taskwarriorProject: provider === 'taskwarrior' ? 'agent-loop' : undefined,
    ...extras,
  })
  return { repoRoot, profile }
}

describe('buildHitlTitle / buildHitlBody', () => {
  it('formats title with HITL prefix', () => {
    expect(buildHitlTitle('manual QA')).toBe('HITL Check: manual QA')
  })

  it('includes reason and loop dir in body', () => {
    const body = buildHitlBody({
      description: 'check deploy',
      reason: 'post_success',
      loopDir: '.cursor/loops/foo',
      projectLabel: 'dxp',
    })
    expect(body).toContain('check deploy')
    expect(body).toContain('post_success')
    expect(body).toContain('.cursor/loops/foo')
    expect(body).toContain('dxp')
  })
})

describe('createHitlCheckpoint', () => {
  beforeEach(() => {
    mockedExecFileSync.mockReset()
  })

  it('writes file checkpoint when provider is file', async () => {
    const { repoRoot, profile } = makeCtx('file')
    const id = await createHitlCheckpoint({
      description: 'verify staging',
      reason: 'post_success',
      ctx: { repoRoot, profile },
      loopDir: '.cursor/loops/x',
    })
    expect(id).toMatch(/^\.cursor\/hitl\//)
    expect(fs.existsSync(path.join(repoRoot, id!))).toBe(true)
  })

  it('skips file checkpoint when hitlFileDir escapes repo root', async () => {
    const { repoRoot, profile } = makeCtx('file')
    profile.hitlFileDir = '../outside-hitl'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await createHitlCheckpoint({
      description: 'escape',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('escapes repo root'))).toBe(true)
    errSpy.mockRestore()
  })

  it('uses taskwarrior when provider is taskwarrior', async () => {
    const { repoRoot, profile } = makeCtx('taskwarrior')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValueOnce('').mockReturnValueOnce('uuid-from-task\n')
    const id = await createHitlCheckpoint({
      description: 'tw check',
      reason: 'review_gate',
      ctx: { repoRoot, profile },
      loopOverrides: { taskwarriorProject: 'agent-loop' },
    })
    expect(id).toBe('uuid-from-task')
  })

  it('returns undefined for taskwarrior without resolvable project', async () => {
    const { repoRoot, profile } = makeCtx('file')
    profile.hitlProvider = 'taskwarrior'
    profile.taskwarriorProject = undefined
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await createHitlCheckpoint({
      description: 'no project',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('could not create HITL'))).toBe(true)
    errSpy.mockRestore()
  })

  it('warns and returns undefined for command provider without hitlCommand', async () => {
    const { repoRoot, profile } = makeCtx('command')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await createHitlCheckpoint({
      description: 'x',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('hitlCommand'))).toBe(true)
    errSpy.mockRestore()
  })

  it('runs github provider with cwd set to repo root', async () => {
    const { repoRoot, profile } = makeCtx('github')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValueOnce('https://github.com/org/repo/issues/1\n')
    const id = await createHitlCheckpoint({
      description: 'gh check',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBe('https://github.com/org/repo/issues/1')
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'gh',
      ['issue', 'create', '--title', 'HITL Check: gh check', '--body', expect.any(String)],
      expect.objectContaining({ cwd: repoRoot }),
    )
  })

  it('returns Linear issue URL on GraphQL success', async () => {
    const { repoRoot, profile } = makeCtx('linear', { hitlLinearTeam: 'ENG' })
    process.env[LINEAR_API_KEY_ENV] = 'lin_api_test'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { query?: string }
      if (body.query?.includes('teams(')) {
        return {
          ok: true,
          json: async () => ({ data: { teams: { nodes: [{ id: 'team-uuid-1' }] } } }),
        }
      }
      return {
        ok: true,
        json: async () => ({
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'issue-1',
                url: 'https://linear.app/acme/issue/ENG-42',
                identifier: 'ENG-42',
              },
            },
          },
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await createHitlCheckpoint({
      description: 'linear check',
      reason: 'review_gate',
      ctx: { repoRoot, profile },
    })
    expect(id).toBe('https://linear.app/acme/issue/ENG-42')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('warns and returns undefined when Linear API key is missing', async () => {
    const { repoRoot, profile } = makeCtx('linear', { hitlLinearTeam: 'ENG' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await createHitlCheckpoint({
      description: 'linear check',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('LINEAR_API_KEY'))).toBe(true)
    errSpy.mockRestore()
  })

  it('warns when linear provider has no hitlLinearTeam', async () => {
    const { repoRoot, profile } = makeCtx('linear')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const id = await createHitlCheckpoint({
      description: 'no team',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('hitlLinearTeam'))).toBe(true)
    errSpy.mockRestore()
  })

  it('uses Linear team UUID without a teams lookup', async () => {
    const teamId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const { repoRoot, profile } = makeCtx('linear', { hitlLinearTeam: teamId })
    process.env[LINEAR_API_KEY_ENV] = 'lin_api_test'
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          issueCreate: {
            success: true,
            issue: { id: 'issue-2', url: 'https://linear.app/acme/issue/ENG-99' },
          },
        },
      }),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const id = await createHitlCheckpoint({
      description: 'uuid team',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBe('https://linear.app/acme/issue/ENG-99')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(String(firstCall[1]?.body)) as {
      variables: { input: { teamId: string } }
    }
    expect(body.variables.input.teamId).toBe(teamId)
  })

  it('returns undefined when Linear GraphQL fails', async () => {
    const { repoRoot, profile } = makeCtx('linear', { hitlLinearTeam: 'ENG' })
    process.env[LINEAR_API_KEY_ENV] = 'lin_api_test'
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'boom',
      })),
    )
    const id = await createHitlCheckpoint({
      description: 'linear fail',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('could not create Linear'))).toBe(
      true,
    )
    errSpy.mockRestore()
  })

  it('returns github id undefined when gh stdout is empty', async () => {
    const { repoRoot, profile } = makeCtx('github')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValueOnce('\n')
    const id = await createHitlCheckpoint({
      description: 'empty gh',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
  })

  it('returns undefined when gh issue create throws', async () => {
    const { repoRoot, profile } = makeCtx('github')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('gh not logged in')
    })
    const id = await createHitlCheckpoint({
      description: 'gh fail',
      reason: 'post_success',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('could not create GitHub'))).toBe(
      true,
    )
    errSpy.mockRestore()
  })

  it('runs command provider and returns last stdout line', async () => {
    const { repoRoot, profile } = makeCtx('command', {
      hitlCommand: 'echo checkpoint-id',
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockReturnValueOnce('noise\ncheckpoint-id\n')
    const id = await createHitlCheckpoint({
      description: 'cmd check',
      reason: 'post_success',
      ctx: { repoRoot, profile },
      loopDir: '/tmp/loop',
    })
    expect(id).toBe('checkpoint-id')
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      'echo checkpoint-id',
      expect.objectContaining({
        cwd: repoRoot,
        shell: true,
        env: expect.objectContaining({
          HITL_TITLE: 'HITL Check: cmd check',
          HITL_LOOP_DIR: '/tmp/loop',
          HITL_REASON: 'post_success',
        }),
      }),
    )
  })

  it('returns undefined when hitlCommand throws', async () => {
    const { repoRoot, profile } = makeCtx('command', { hitlCommand: 'false' })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('exit 1')
    })
    const id = await createHitlCheckpoint({
      description: 'cmd fail',
      reason: 'review_gate',
      ctx: { repoRoot, profile },
    })
    expect(id).toBeUndefined()
    expect(errSpy.mock.calls.some((c) => String(c[0]).includes('HITL command failed'))).toBe(true)
    errSpy.mockRestore()
  })
})

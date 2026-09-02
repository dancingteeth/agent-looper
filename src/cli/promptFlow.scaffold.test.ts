import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runScaffoldAgent } from './promptFlow.js'

const { runOneShotAgentPrompt } = vi.hoisted(() => ({
  runOneShotAgentPrompt: vi.fn(),
}))

vi.mock('../agents/oneShotAgentRun.js', () => ({
  runOneShotAgentPrompt,
}))

vi.mock('./detectRuntimes.js', () => ({
  detectLoopRuntimes: vi.fn(async () => ({
    cursor: 'detected',
    cline: 'missing',
    opencode: 'detected',
    pi: 'missing',
    codex: 'missing',
    dsh: 'missing',
    muse: 'missing',
  })),
  emptyDetection: () => ({
    cursor: 'missing',
    cline: 'missing',
    opencode: 'missing',
    pi: 'missing',
    codex: 'missing',
    dsh: 'missing',
    muse: 'missing',
  }),
}))

const dirs: string[] = []

function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  vi.resetAllMocks()
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runScaffoldAgent', () => {
  it('runs the judge (review agent), not the worker', async () => {
    const repo = tmpDir('agent-loop-scaffold-judge-')
    const loopDir = path.join(repo, '.cursor', 'loops', 'museum')
    fs.mkdirSync(loopDir, { recursive: true })
    fs.writeFileSync(
      path.join(loopDir, 'loop.json'),
      JSON.stringify({
        verify: 'bash verify.sh',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        reviewRuntime: 'cursor',
        reviewModel: 'grok-4.6',
      }),
    )
    runOneShotAgentPrompt.mockResolvedValue({ text: 'ok' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runScaffoldAgent(loopDir, repo, 'virtual museum of tech from 2000')

    expect(runOneShotAgentPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ repoRoot: repo }),
      expect.stringContaining('virtual museum of tech from 2000'),
      { runtime: 'cursor', model: 'grok-4.6' },
      expect.objectContaining({ phase: 'scaffold' }),
    )
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(
      /scaffold judge=cursor\/grok-4\.6/,
    )
    errorSpy.mockRestore()
  })
})

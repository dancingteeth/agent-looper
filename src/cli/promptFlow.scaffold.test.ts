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

function writeLoopDir(repo: string): string {
  const loopDir = path.join(repo, '.cursor', 'loops', 'gacha')
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
  return loopDir
}

function writeFreezeReadySpec(loopDir: string): void {
  fs.writeFileSync(
    path.join(loopDir, 'GOAL.md'),
    `# Task

## Goal
Ship the gacha studio.

## Constraints
- Do not disable tests.

## Acceptance criteria
Success is determined only by the verifier in \`loop.json\`, not by your assessment.
verify.sh must exit 0.

## Out of scope
- Deploy to production
`,
    'utf8',
  )
  fs.writeFileSync(
    path.join(loopDir, 'verify.sh'),
    `#!/usr/bin/env bash
set -euo pipefail
test -f src/index.html
`,
    'utf8',
  )
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
      expect.objectContaining({
        phase: 'scaffold',
        timeoutMs: 10 * 60 * 1000,
        signal: expect.any(AbortSignal),
      }),
    )
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(
      /scaffold judge=cursor\/grok-4\.6 timeout=600s/,
    )
    errorSpy.mockRestore()
  })

  it('skips the judge when GOAL.md and verify.sh already pass freeze', async () => {
    const repo = tmpDir('agent-loop-scaffold-skip-')
    const loopDir = writeLoopDir(repo)
    writeFreezeReadySpec(loopDir)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await runScaffoldAgent(loopDir, repo, 'already done')

    expect(runOneShotAgentPrompt).not.toHaveBeenCalled()
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/already freeze-ready/)
    errorSpy.mockRestore()
  })

  it('aborts the judge once GOAL.md and verify.sh pass freeze', async () => {
    const repo = tmpDir('agent-loop-scaffold-abort-')
    const loopDir = writeLoopDir(repo)
    let signal: AbortSignal | undefined
    runOneShotAgentPrompt.mockImplementation(
      (_ctx, _prompt, _agent, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal = options.signal
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const done = runScaffoldAgent(loopDir, repo, 'online gacha')
    await vi.waitFor(() => {
      expect(signal).toBeDefined()
    })
    writeFreezeReadySpec(loopDir)
    await done

    expect(signal?.aborted).toBe(true)
    expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/spec files ready/)
    errorSpy.mockRestore()
  })
})

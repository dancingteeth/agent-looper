import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { executePromptFlow } from './prompt.js'
import {
  assertFreezeReady,
  assertPreviewTrusted,
  formatRunHandoffCommand,
  readDraftSnapshot,
} from './promptFlow.js'

const { runScaffoldAgent, spawnLoopRun, waitForChildExit, spawnPreviewDetached } = vi.hoisted(
  () => ({
    runScaffoldAgent: vi.fn(),
    spawnLoopRun: vi.fn(),
    waitForChildExit: vi.fn(),
    spawnPreviewDetached: vi.fn(),
  }),
)

vi.mock('./promptFlow.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./promptFlow.js')>()
  return {
    ...actual,
    runScaffoldAgent,
    spawnLoopRun,
    waitForChildExit,
    spawnPreviewDetached,
  }
})

vi.mock('./detectRuntimes.js', () => ({
  detectLoopRuntimes: vi.fn(async () => ({
    cursor: 'detected',
    cline: 'missing',
    opencode: 'missing',
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

function writeLoopBundle(
  repo: string,
  loopJson: Record<string, unknown> = { verify: 'bash verify.sh' },
): string {
  const loopDir = path.join(repo, '.cursor', 'loops', 'x')
  fs.mkdirSync(loopDir, { recursive: true })
  fs.writeFileSync(path.join(loopDir, 'loop.json'), JSON.stringify(loopJson))
  fs.writeFileSync(
    path.join(loopDir, 'GOAL.md'),
    [
      '# Goal',
      '',
      '## Goal',
      'Ship the change.',
      '',
      '## Constraints',
      '- Stay in scope.',
      '',
      '## Acceptance criteria',
      'Success is determined only by the verifier in loop.json.',
      '',
      '## Out of scope',
      '- Deploy',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(path.join(loopDir, 'verify.sh'), '#!/bin/sh\ntrue\n')
  return loopDir
}

afterEach(() => {
  vi.resetAllMocks()
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('promptFlow helpers', () => {
  it('refuses freeze when GOAL.md fails harness preflight', () => {
    const repo = tmpDir('agent-loop-prompt-preflight-')
    const loopDir = writeLoopBundle(repo)
    fs.writeFileSync(
      path.join(loopDir, 'GOAL.md'),
      '# Goal\nA visual museum spec.\n\n## Constraints\nStay in src.\n\n## Out of scope\nDeploy.\n',
    )
    expect(() => assertFreezeReady(loopDir)).toThrow(/preflight/i)
  })

  it('refuses freeze when verify.sh uses a gameable title-OR grep', () => {
    const repo = tmpDir('agent-loop-prompt-verifylint-')
    const loopDir = writeLoopBundle(repo)
    fs.writeFileSync(
      path.join(loopDir, 'verify.sh'),
      `#!/bin/sh\ngrep -qE 'Compact Disc Player|Candybar Phone|Handheld LCD Game' src/index.html\n`,
    )
    expect(() => assertFreezeReady(loopDir)).toThrow(/freeze lint|A\|B\|C/i)
  })

  it('formats run handoff command', () => {
    const repo = '/repo'
    const loopDir = path.join(repo, '.cursor', 'loops', 'foo')
    expect(formatRunHandoffCommand(loopDir, repo, {})).toBe('agent-loop run .cursor/loops/foo')
    expect(
      formatRunHandoffCommand(loopDir, repo, {
        DOPPLER_PROJECT: 'agent-looper',
        DOPPLER_CONFIG: 'dev',
      }),
    ).toBe(
      'doppler run --project agent-looper --config dev -- agent-loop run .cursor/loops/foo',
    )
  })

  it('reads preview from loop.json', () => {
    const repo = tmpDir('agent-loop-prompt-repo-')
    const loopDir = writeLoopBundle(repo, { verify: 'bash verify.sh', preview: 'pnpm dev' })
    const snap = readDraftSnapshot(loopDir)
    expect(snap.preview).toBe('pnpm dev')
    expect(snap.verifyCommand).toBe('bash verify.sh')
  })

  it('throws when preview is untrusted under require-trust', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      assertPreviewTrusted({
        cwd: '/repo',
        preview: 'pnpm preview',
        env: { AGENT_LOOP_REQUIRE_TRUST_CONFIG: '1' },
      }),
    ).toThrow(/not trusted/)
    errorSpy.mockRestore()
  })

  it('allows preview when trustConfig is set', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      assertPreviewTrusted({
        cwd: '/repo',
        preview: 'pnpm preview',
        trustConfig: true,
        env: { AGENT_LOOP_REQUIRE_TRUST_CONFIG: '1' },
      }),
    ).not.toThrow()
    errorSpy.mockRestore()
  })
})

describe('executePromptFlow', () => {
  it('does not spawn run when --no-run', async () => {
    const repo = tmpDir('agent-loop-prompt-norun-')
    const loopDir = writeLoopBundle(repo)
    runScaffoldAgent.mockResolvedValue(undefined)

    const logs: string[] = []
    const logSpy = vi.spyOn(console, 'log').mockImplementation((line) => {
      logs.push(String(line))
    })

    const code = await executePromptFlow({
      outDir: loopDir,
      repoRoot: repo,
      prompt: 'add tests',
      plain: true,
      noRun: true,
      yes: true,
    })

    expect(code).toBe(0)
    expect(spawnLoopRun).not.toHaveBeenCalled()
    expect(logs.join('\n')).toMatch(/agent-loop run/)

    logSpy.mockRestore()
  })

  function mockRunChild(loopDir: string): void {
    runScaffoldAgent.mockResolvedValue(undefined)
    spawnLoopRun.mockReturnValue({
      child: { once: vi.fn(), kill: vi.fn() },
      logPath: path.join(loopDir, 'prompt-run.log'),
      bundleLabel: '.cursor/loops/x',
    })
  }

  it('spawns preview after a successful run', async () => {
    const repo = tmpDir('agent-loop-prompt-preview-')
    const loopDir = writeLoopBundle(repo, { verify: 'bash verify.sh', preview: 'pnpm preview' })
    mockRunChild(loopDir)
    waitForChildExit.mockResolvedValue(0)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await executePromptFlow({
      outDir: loopDir,
      repoRoot: repo,
      prompt: 'ui loop',
      plain: true,
      noRun: false,
      yes: true,
    })

    expect(code).toBe(0)
    expect(spawnLoopRun).toHaveBeenCalled()
    expect(spawnPreviewDetached).toHaveBeenCalledWith('pnpm preview', repo)
    errorSpy.mockRestore()
  })

  it('does not spawn preview after a failed run', async () => {
    const repo = tmpDir('agent-loop-prompt-preview-fail-')
    const loopDir = writeLoopBundle(repo, { verify: 'bash verify.sh', preview: 'pnpm preview' })
    mockRunChild(loopDir)
    waitForChildExit.mockResolvedValue(1)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const code = await executePromptFlow({
      outDir: loopDir,
      repoRoot: repo,
      prompt: 'ui loop',
      plain: true,
      noRun: false,
      yes: true,
    })

    expect(code).toBe(1)
    expect(spawnPreviewDetached).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('skips preview spawn when require-trust is on and untrusted', async () => {
    const repo = tmpDir('agent-loop-prompt-preview-trust-')
    const loopDir = writeLoopBundle(repo, { verify: 'bash verify.sh', preview: 'pnpm preview' })
    mockRunChild(loopDir)
    waitForChildExit.mockResolvedValue(0)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const previous = process.env.AGENT_LOOP_REQUIRE_TRUST_CONFIG
    process.env.AGENT_LOOP_REQUIRE_TRUST_CONFIG = '1'

    try {
      const code = await executePromptFlow({
        outDir: loopDir,
        repoRoot: repo,
        prompt: 'ui loop',
        plain: true,
        noRun: false,
        yes: true,
      })
      expect(code).toBe(0)
      expect(spawnPreviewDetached).not.toHaveBeenCalled()
      expect(errorSpy.mock.calls.flat().join('\n')).toMatch(/preview not started/)
    } finally {
      if (previous === undefined) {
        delete process.env.AGENT_LOOP_REQUIRE_TRUST_CONFIG
      } else {
        process.env.AGENT_LOOP_REQUIRE_TRUST_CONFIG = previous
      }
      errorSpy.mockRestore()
    }
  })
})

import { describe, expect, it } from 'vitest'
import { buildAgentLoopPrompt } from './loopPrompt.js'

describe('buildAgentLoopPrompt', () => {
  it('includes goal and git context', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Ship feature X',
      iteration: 2,
      maxIterations: 5,
      git: {
        branch: 'feat/x',
        shortSha: 'abc1234',
        diffStat: ' src/foo.ts | 2 ++',
        statusPorcelain: ' M src/foo.ts',
      },
      lastVerify: null,
      priorFailures: [],
    })
    expect(prompt).toContain('Ship feature X')
    expect(prompt).toContain('feat/x')
    expect(prompt).toContain('abc1234')
    expect(prompt).toContain('iteration 2 of 5')
  })

  it('includes prior verifier failures', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Fix tests',
      iteration: 3,
      maxIterations: 8,
      git: {
        branch: 'main',
        shortSha: 'deadbeef',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: {
        complete: false,
        command: 'vitest run',
        exitCode: 1,
        stdout: 'FAIL src/a.test.ts',
        stderr: '',
        reason: 'Verifier failed',
      },
      priorFailures: [
        {
          complete: false,
          command: 'vitest run',
          exitCode: 1,
          stdout: 'FAIL',
          stderr: '',
          reason: 'Verifier failed',
        },
      ],
    })
    expect(prompt).toContain('vitest run')
    expect(prompt).toContain('FAIL src/a.test.ts')
  })

  it('includes review blockers when provided', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Fix docs',
      iteration: 2,
      maxIterations: 5,
      git: {
        branch: 'main',
        shortSha: 'abc1234',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
      reviewBlockers: ['[must-fix] **Docs missing** — README still template'],
    })
    expect(prompt).toContain('Review blockers (must fix)')
    expect(prompt).toContain('Docs missing')
    expect(prompt).toContain('Out-of-repo blockers')
  })

  it('includes reverse mode section when mode is reverse', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Rebuild parser',
      iteration: 1,
      maxIterations: 5,
      git: {
        branch: 'main',
        shortSha: 'abc1234',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
      mode: 'reverse',
    })
    expect(prompt).toContain('Reverse mode (clean-room)')
    expect(prompt).toContain('minimal correct solution')
  })

  it('includes injected failure context when provided', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Fix smoke test',
      iteration: 1,
      maxIterations: 5,
      git: {
        branch: 'main',
        shortSha: 'abc1234',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
      failureContext: '# Failure context\n\nProbe timed out.',
    })
    expect(prompt).toContain('Injected failure context')
    expect(prompt).toContain('Probe timed out')
  })

  it('includes stagnation warning when repeat count provided', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Fix tests',
      iteration: 4,
      maxIterations: 8,
      git: {
        branch: 'main',
        shortSha: 'deadbeef',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
      stagnationRepeatCount: 3,
    })
    expect(prompt).toContain('Stagnation warning')
    expect(prompt).toContain('Do **not** edit `GOAL.md`')
  })
})

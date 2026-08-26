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
    expect(prompt).toContain('Iteration 2 of 5')
  })

  it('keeps the prompt head stable across iterations (cache prefix)', () => {
    const git = {
      branch: 'feat/x',
      shortSha: 'abc1234',
      diffStat: ' src/foo.ts | 2 ++',
      statusPorcelain: ' M src/foo.ts',
    }
    const build = (iteration: number) =>
      buildAgentLoopPrompt({
        goal: 'Ship feature X',
        iteration,
        maxIterations: 5,
        git,
        lastVerify: null,
        priorFailures: [],
      })
    const headUpToRules = (prompt: string) =>
      prompt.slice(0, prompt.indexOf('## Workspace (git)'))
    expect(headUpToRules(build(1))).toBe(headUpToRules(build(4)))
    expect(headUpToRules(build(1))).toContain('## Rules')
    expect(headUpToRules(build(1))).not.toContain('Iteration 1 of 5')
    expect(build(4)).toContain('Iteration 4 of 5')
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

  it('prefers guide packets over raw review blockers', () => {
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
      reviewBlockers: ['raw fallback should not appear'],
      guidePackets: [
        {
          reason: 'Docs missing (impact: false-closure)',
          requiredChange: 'Add README acceptance section',
          impact: 'false-closure',
          severity: 'error',
          raw: 'severity: error impact: false-closure **Docs missing** — Add README',
        },
      ],
    })
    expect(prompt).toContain('Guide packets (must fix)')
    expect(prompt).toContain('**Guide** — Docs missing')
    expect(prompt).toContain('Required change: Add README acceptance section')
    expect(prompt).not.toContain('raw fallback should not appear')
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

  it('includes batch rubric in volatile tail after workspace', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Ship feature X',
      iteration: 1,
      maxIterations: 5,
      git: {
        branch: 'feat/x',
        shortSha: 'abc1234',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
      batchRubric: 'Keep docs-only; no Playwright.',
    })
    const workspaceIdx = prompt.indexOf('## Workspace (git)')
    const rubricIdx = prompt.indexOf('## Batch rubric')
    const lastVerifyIdx = prompt.indexOf('## Last verifier result')
    expect(rubricIdx).toBeGreaterThan(workspaceIdx)
    expect(rubricIdx).toBeLessThan(lastVerifyIdx)
    expect(prompt).toContain('Keep docs-only; no Playwright.')
  })

  it('omits batch rubric section when not provided', () => {
    const prompt = buildAgentLoopPrompt({
      goal: 'Ship feature X',
      iteration: 1,
      maxIterations: 5,
      git: {
        branch: 'feat/x',
        shortSha: 'abc1234',
        diffStat: '',
        statusPorcelain: '',
      },
      lastVerify: null,
      priorFailures: [],
    })
    expect(prompt).not.toContain('## Batch rubric')
  })

  it('puts research index in the stable head and omits it when absent', () => {
    const git = {
      branch: 'feat/x',
      shortSha: 'abc1234',
      diffStat: '',
      statusPorcelain: '',
    }
    const withResearch = (iteration: number) =>
      buildAgentLoopPrompt({
        goal: 'Ship feature X',
        iteration,
        maxIterations: 5,
        git,
        lastVerify: null,
        priorFailures: [],
        researchSection: '## Research (index)\n\nRead `.cursor/loops/x/RESEARCH.md`.',
      })
    const head = (prompt: string) => prompt.slice(0, prompt.indexOf('## Workspace (git)'))
    expect(head(withResearch(1))).toBe(head(withResearch(3)))
    expect(head(withResearch(1))).toContain('## Research (index)')
    expect(withResearch(1).indexOf('## Research (index)')).toBeLessThan(
      withResearch(1).indexOf('## Workspace (git)'),
    )
    const without = buildAgentLoopPrompt({
      goal: 'Ship feature X',
      iteration: 1,
      maxIterations: 5,
      git,
      lastVerify: null,
      priorFailures: [],
    })
    expect(without).not.toContain('## Research (index)')
  })
})

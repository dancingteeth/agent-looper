import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { metaLoopConfigSchema } from './loopMeta.js'
import { repoProfileSchema } from '../context/repoProfile.js'

vi.mock('./agentLoop.js', () => ({
  runAgentLoop: vi.fn(),
}))

import { runAgentLoop } from './agentLoop.js'
import { runMetaLoop } from './loopMeta.js'
import { batchLoopConfig } from './loopBatchConfig.js'
import { emptyUsageSummary } from '../usage/loopUsage.js'

const mockedRunAgentLoop = vi.mocked(runAgentLoop)

function passResult(): Awaited<ReturnType<typeof runAgentLoop>> {
  return {
    complete: true,
    iterations: 1,
    completionReason: 'Verifier passed',
    lastVerify: {
      complete: true,
      command: 'true',
      exitCode: 0,
      stdout: '',
      stderr: '',
      reason: 'ok',
    },
    logPath: '/tmp/log.ndjson',
    usage: emptyUsageSummary(),
  }
}

function failResult(stdout = 'FAIL'): Awaited<ReturnType<typeof runAgentLoop>> {
  return {
    complete: false,
    iterations: 2,
    completionReason: 'Max iterations',
    lastVerify: {
      complete: false,
      command: 'false',
      exitCode: 1,
      stdout,
      stderr: '',
      reason: 'failed',
    },
    logPath: '/tmp/log.ndjson',
    usage: emptyUsageSummary(),
  }
}

describe('metaLoopConfigSchema', () => {
  it('defaults maxCycles to 3', () => {
    const parsed = metaLoopConfigSchema.parse({ probe: 'smoke', fix: 'fix-smoke' })
    expect(parsed.maxCycles).toBe(3)
  })
})

const VALID_GOAL = `# Task

## Goal
Fix the thing under test.

## Constraints
- Do not disable tests.

## Acceptance criteria
Success is determined only by the verifier in \`loop.json\`, not by your assessment.

## Out of scope
- Deploy to production
`

describe('runMetaLoop', () => {
  let batchDir: string
  let probeDir: string
  let fixDir: string

  beforeEach(() => {
    vi.clearAllMocks()
    batchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-batch-'))
    probeDir = path.join(batchDir, '..', 'probe-loop')
    fixDir = path.join(batchDir, '..', 'fix-loop')
    fs.mkdirSync(probeDir, { recursive: true })
    fs.mkdirSync(fixDir, { recursive: true })
    for (const dir of [probeDir, fixDir]) {
      fs.writeFileSync(path.join(dir, 'GOAL.md'), VALID_GOAL)
      fs.writeFileSync(
        path.join(dir, 'loop.json'),
        JSON.stringify({ verify: 'true', maxIterations: 2, postQualityReview: false }),
      )
    }
  })

  afterEach(() => {
    for (const dir of [batchDir, probeDir, fixDir]) {
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('completes when probe passes on first cycle', async () => {
    mockedRunAgentLoop.mockResolvedValueOnce(passResult())

    const result = await runMetaLoop({
      ctx: {
        repoRoot: process.cwd(),
        profile: repoProfileSchema.parse({ syncCommand: null }),
      },
      batchDir,
      meta: { probe: 'probe-loop', fix: 'fix-loop', maxCycles: 3 },
      batchLoopConfig,
    })

    expect(result.complete).toBe(true)
    expect(result.cyclesRun).toBe(1)
    expect(mockedRunAgentLoop).toHaveBeenCalledTimes(1)
  })

  it('runs fix loop when probe fails then succeeds on re-probe', async () => {
    mockedRunAgentLoop
      .mockResolvedValueOnce(failResult())
      .mockResolvedValueOnce(passResult())
      .mockResolvedValueOnce(passResult())

    const result = await runMetaLoop({
      ctx: {
        repoRoot: process.cwd(),
        profile: repoProfileSchema.parse({ syncCommand: null }),
      },
      batchDir,
      meta: { probe: 'probe-loop', fix: 'fix-loop', maxCycles: 3 },
      batchLoopConfig,
    })

    expect(result.complete).toBe(true)
    expect(mockedRunAgentLoop).toHaveBeenCalledTimes(3)
    const fixCall = mockedRunAgentLoop.mock.calls[1]?.[0]
    expect(fixCall?.bundle.config.injectFailureContext).toBe(true)
  })
})

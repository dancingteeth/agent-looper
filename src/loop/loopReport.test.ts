import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  formatBatchCompletionReport,
  formatLoopCompletionReport,
  readLatestLoopReview,
  readLatestReviewContent,
  resolveLatestReviewPath,
  reviewDocumentFilename,
} from './loopReport.js'
import { emptyUsageSummary } from '../usage/loopUsage.js'
import type { AgentLoopResult } from './agentLoop.js'
import type { LoopBatchResult } from './loopBatch.js'

function loopResult(overrides: Partial<AgentLoopResult> = {}): AgentLoopResult {
  return {
    complete: true,
    iterations: 2,
    completionReason: 'Verifier passed (exit 0).',
    lastVerify: {
      complete: true,
      command: 'pnpm test',
      exitCode: 0,
      stdout: '',
      stderr: '',
      reason: 'Verifier passed (exit 0).',
    },
    logPath: '/tmp/log.ndjson',
    usage: emptyUsageSummary(),
    ...overrides,
  }
}

describe('resolveLatestReviewPath', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns review.md when it is the only review file', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-report-review-'))
    const reviewPath = path.join(tmpDir, 'review.md')
    fs.writeFileSync(reviewPath, '### Verdict\n**PASS**\n')

    expect(resolveLatestReviewPath(tmpDir)).toBe(reviewPath)
  })

  it('prefers the highest review cycle when review.md and review.N.md coexist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-report-review-'))
    fs.writeFileSync(
      path.join(tmpDir, 'review.md'),
      `### Risk
**HIGH**

### Verdict
**BLOCKERS**

### Blockers
- stale first review
`,
    )
    fs.writeFileSync(
      path.join(tmpDir, 'review.2.md'),
      `### Risk
**LOW**

### Verdict
**PASS**

### Blockers
`,
    )

    expect(resolveLatestReviewPath(tmpDir)).toBe(path.join(tmpDir, 'review.2.md'))
    expect(readLatestLoopReview(tmpDir)?.verdict).toBe('PASS')
  })

  it('returns undefined when the loop directory is missing', () => {
    expect(resolveLatestReviewPath('/tmp/does-not-exist-loop-report-review')).toBeUndefined()
  })

  it('reads latest review markdown from disk', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-report-review-content-'))
    fs.writeFileSync(
      path.join(tmpDir, 'review.md'),
      '# Post-loop quality review\n\n### Verdict\n**PASS**',
    )

    expect(readLatestReviewContent(tmpDir)).toContain('**PASS**')
    expect(reviewDocumentFilename(tmpDir)).toBe('review.md')
  })
})

describe('formatLoopCompletionReport', () => {
  it('includes status, bundle, iterations, and usage', () => {
    const report = formatLoopCompletionReport({
      repoRoot: '/Users/me/Projects/payload-ecommerce',
      bundleLabel: '.cursor/loops/example-fix',
      loopDir: '/Users/me/Projects/payload-ecommerce/.cursor/loops/example-fix',
      result: loopResult(),
    })

    expect(report).toContain('✅ Loop complete')
    expect(report).toContain('Repo: payload-ecommerce')
    expect(report).toContain('Bundle: .cursor/loops/example-fix')
    expect(report).toContain('Iterations: 2')
    expect(report).toContain('usage:')
    expect(report).toContain('Suggested next steps')
  })

  it('surfaces advisory blockers and inner-agent warnings', () => {
    const report = formatLoopCompletionReport({
      repoRoot: process.cwd(),
      bundleLabel: 'loop-a',
      loopDir: process.cwd(),
      result: loopResult({
        reviewAdvisoryBlockers: true,
        innerAgentIncomplete: true,
        hitlCheckTaskUuid: 'a74a94d1-2069-4e05-861e-de80143b0526',
      }),
    })

    expect(report).toContain('advisory')
    expect(report).toContain('clineMaxIterations')
    expect(report).toContain('uuid:a74a94d1-2069-4e05-861e-de80143b0526')
  })

  it('includes verifier snippet on failure', () => {
    const report = formatLoopCompletionReport({
      repoRoot: '/repo',
      bundleLabel: 'loop-a',
      loopDir: '/repo/loop-a',
      result: loopResult({
        complete: false,
        completionReason: 'Max iterations reached',
        lastVerify: {
          complete: false,
          command: 'pnpm test',
          exitCode: 1,
          stdout: 'FAIL src/foo.test.ts',
          stderr: '',
          reason: 'Verifier failed (exit 1).',
        },
      }),
    })

    expect(report).toContain('❌ Loop failed')
    expect(report).toContain('FAIL src/foo.test.ts')
  })
})

describe('formatBatchCompletionReport', () => {
  it('lists each loop in the batch', () => {
    const result: LoopBatchResult = {
      complete: false,
      loopsRun: 2,
      completionReason: 'Loop 2/3 failed: Max iterations',
      usage: emptyUsageSummary(),
      iterations: [
        {
          loopDir: '/repo/.cursor/loops/a',
          result: loopResult({ complete: true, iterations: 1 }),
        },
        {
          loopDir: '/repo/.cursor/loops/b',
          result: loopResult({
            complete: false,
            iterations: 8,
            completionReason: 'Max iterations',
          }),
        },
      ],
    }

    const report = formatBatchCompletionReport({
      repoRoot: '/repo',
      batchLabel: '.cursor/loops/affiliate',
      result,
    })

    expect(report).toContain('❌ Batch failed')
    expect(report).toContain('✓ .cursor/loops/a')
    expect(report).toContain('✗ .cursor/loops/b')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { emptyUsageSummary } from '../usage/loopUsage.js'
import { DEFAULT_REPO_PROFILE } from '../context/repoProfile.js'
import { parseLoopConfig } from './loopConfig.js'
import {
  buildRunReportMarkdown,
  reconstructAgentLoopResultFromLog,
  writeRunReportArtifacts,
} from './loopRunReport.js'
import type { AgentLoopResult } from './agentLoop.js'
import { deriveLoopRunStatus } from './agentLoop.js'
import type { RepoContext } from '../context/repoContext.js'

function loopResult(overrides: Partial<AgentLoopResult> = {}): AgentLoopResult {
  const base = {
    complete: true as const,
    iterations: 1,
    completionReason: 'Verifier passed (exit 0).',
    lastVerify: {
      complete: true,
      command: 'bash verify.sh',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      reason: 'Verifier passed (exit 0).',
    },
    logPath: '/tmp/log.ndjson',
    usage: emptyUsageSummary(),
    ...overrides,
  }
  return {
    ...base,
    status: overrides.status ?? deriveLoopRunStatus(base),
  }
}

function minimalCtx(repoRoot: string): RepoContext {
  return {
    repoRoot,
    profile: DEFAULT_REPO_PROFILE,
  }
}

describe('reconstructAgentLoopResultFromLog', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('rebuilds result from log.ndjson entries', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      [
        JSON.stringify({
          at: '2026-07-22T00:00:00.000Z',
          iteration: 1,
          branch: 'feat/x',
          shortSha: 'abc1234',
          verify: {
            complete: false,
            command: 'bash verify.sh',
            exitCode: 1,
            stdout: 'fail',
            stderr: '',
            reason: 'Verifier failed (exit 1).',
          },
          assistantPreview: 'fix attempt',
          usage: {
            phase: 'implement',
            model: 'composer-2.5',
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costUsd: 0.01,
          },
        }),
        JSON.stringify({
          at: '2026-07-22T00:05:00.000Z',
          iteration: 2,
          branch: 'feat/x',
          shortSha: 'def5678',
          verify: {
            complete: true,
            command: 'bash verify.sh',
            exitCode: 0,
            stdout: 'ok',
            stderr: '',
            reason: 'Verifier passed (exit 0).',
          },
          assistantPreview: 'done',
          toolSummary: { Read: 3, Shell: 1 },
          workerSession: { provider: 'cursor', runId: 'run-1' },
        }),
      ].join('\n') + '\n',
      'utf8',
    )

    const result = reconstructAgentLoopResultFromLog(logPath)
    expect(result.iterations).toBe(2)
    expect(result.complete).toBe(true)
    expect(result.usage.totalInputTokens).toBe(100)
    expect(result.lastVerify?.exitCode).toBe(0)
  })

  it('throws when log is empty', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-empty-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(logPath, '', 'utf8')
    expect(() => reconstructAgentLoopResultFromLog(logPath)).toThrow(/No iterations/)
  })

  it('marks incomplete when review gate stopped after verify passed', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-gate-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      `${JSON.stringify({
        at: '2026-07-22T00:00:00.000Z',
        iteration: 1,
        branch: 'main',
        shortSha: 'abc1234',
        verify: {
          complete: true,
          command: 'bash verify.sh',
          exitCode: 0,
          stdout: '',
          stderr: '',
          reason: 'Verifier passed (exit 0).',
        },
        assistantPreview: 'done',
        review: { verdict: 'BLOCKERS', risk: 'medium', blockersCount: 2 },
      })}\n`,
      'utf8',
    )

    const config = parseLoopConfig({ verify: 'bash verify.sh', reviewGate: true })
    const result = reconstructAgentLoopResultFromLog(logPath, { config })
    expect(result.complete).toBe(false)
    expect(result.status).toBe('continue')
    expect(result.completionReason).toMatch(/Review gate: BLOCKERS/)
  })

  it('sets status waiting when failure-domains recorded review_gate_hitl', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-hitl-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      `${JSON.stringify({
        at: '2026-07-22T00:00:00.000Z',
        iteration: 1,
        branch: 'main',
        shortSha: 'abc1234',
        verify: {
          complete: true,
          command: 'bash verify.sh',
          exitCode: 0,
          stdout: '',
          stderr: '',
          reason: 'Verifier passed (exit 0).',
        },
        assistantPreview: 'done',
        review: { verdict: 'BLOCKERS', risk: 'medium', blockersCount: 1 },
      })}\n`,
      'utf8',
    )
    fs.writeFileSync(
      path.join(tmpDir, 'failure-domains.ndjson'),
      `${JSON.stringify({
        at: '2026-07-22T00:01:00.000Z',
        iteration: 1,
        reason: 'review_gate_hitl',
        fingerprint: 'fp',
        verify: {
          command: 'bash verify.sh',
          exitCode: 0,
          reason: 'Verifier passed (exit 0).',
        },
        suggestion: 'HITL',
        status: 'waiting',
      })}\n`,
      'utf8',
    )

    const config = parseLoopConfig({
      verify: 'bash verify.sh',
      reviewGate: true,
      reviewGateHitl: true,
    })
    const result = reconstructAgentLoopResultFromLog(logPath, { config })
    expect(result.complete).toBe(false)
    expect(result.reviewEscalatedToHitl).toBe(true)
    expect(result.status).toBe('waiting')
  })
})

describe('buildRunReportMarkdown', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('includes iteration timeline, tools, and session refs', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-md-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      `${JSON.stringify({
        at: '2026-07-22T00:00:00.000Z',
        iteration: 1,
        branch: 'main',
        shortSha: 'abc1234',
        verify: {
          complete: true,
          command: 'bash verify.sh',
          exitCode: 0,
          stdout: '',
          stderr: '',
          reason: 'Verifier passed (exit 0).',
        },
        assistantPreview: 'shipped fix',
        model: 'composer-2.5',
        reasoningEffort: 'default',
        workerSession: { provider: 'cursor', runId: 'run-abc' },
        toolSummary: { Read: 2, Shell: 1 },
      })}\n`,
      'utf8',
    )

    const config = parseLoopConfig({ verify: 'bash verify.sh', reviewGate: true })
    const report = buildRunReportMarkdown({
      ctx: minimalCtx(tmpDir),
      loopDir: tmpDir,
      goal: 'Fix the widget',
      config,
      result: loopResult({ logPath }),
      workerModel: 'composer-2.5',
      reviewModel: 'grok-4.5',
      runtime: 'cursor',
    })

    expect(report).toContain('# Loop run report')
    expect(report).toContain('Why this is a loop')
    expect(report).toContain('Review gate armed')
    expect(report).toContain('### Iteration 1')
    expect(report).toContain('run_id=run-abc')
    expect(report).toContain('Read×2, Shell×1')
    expect(report).toContain('Fix the widget')
  })

  it('writes run-report.md to the bundle', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-run-report-write-'))
    const logPath = path.join(tmpDir, 'log.ndjson')
    fs.writeFileSync(
      logPath,
      `${JSON.stringify({
        at: '2026-07-22T00:00:00.000Z',
        iteration: 1,
        branch: 'main',
        shortSha: 'abc1234',
        verify: {
          complete: true,
          command: 'true',
          exitCode: 0,
          stdout: '',
          stderr: '',
          reason: 'Verifier passed (exit 0).',
        },
        assistantPreview: 'ok',
      })}\n`,
      'utf8',
    )

    const config = parseLoopConfig({ verify: 'true' })
    const { reportPath } = writeRunReportArtifacts({
      ctx: minimalCtx(tmpDir),
      loopDir: tmpDir,
      goal: 'Goal text',
      config,
      result: loopResult({ logPath }),
      workerModel: 'composer-2.5',
      reviewModel: 'grok-4.5',
      runtime: 'cursor',
      transcriptEvents: [
        {
          at: '2026-07-22T00:00:01.000Z',
          type: 'tool_start',
          phase: 'implement',
          iteration: 1,
          name: 'Read',
        },
      ],
    })

    expect(fs.existsSync(reportPath)).toBe(true)
    expect(fs.readFileSync(reportPath, 'utf8')).toContain('Loop run report')
    expect(fs.existsSync(path.join(tmpDir, 'transcript.ndjson'))).toBe(true)
  })
})

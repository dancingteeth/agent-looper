import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FAILURE_CONTEXT_FILENAME,
  buildFailureContextPromptSection,
  clearFailureContext,
  failureContextPath,
  readFailureContext,
  writeFailureContext,
} from './loopFailureContext.js'
import { emptyUsageSummary } from '../usage/loopUsage.js'

describe('loopFailureContext', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('writes and reads failure context for meta-loop fix rounds', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-ctx-'))
    writeFailureContext(tmpDir, {
      probeLoopDir: 'system-smoke',
      probeResult: {
        complete: false,
        iterations: 2,
        completionReason: 'Max iterations reached',
        lastVerify: {
          complete: false,
          command: 'pnpm test:e2e',
          exitCode: 1,
          stdout: 'timeout on login',
          stderr: '',
          reason: 'Verifier failed',
        },
        logPath: path.join(tmpDir, 'log.ndjson'),
        usage: emptyUsageSummary(),
      },
      cycle: 1,
      maxCycles: 3,
    })

    expect(fs.existsSync(failureContextPath(tmpDir))).toBe(true)
    const context = readFailureContext(tmpDir)
    expect(context).toContain('system-smoke')
    expect(context).toContain('timeout on login')
    expect(FAILURE_CONTEXT_FILENAME).toBe('failure-context.md')
  })

  it('builds prompt section from context', () => {
    const section = buildFailureContextPromptSection('# Failure context\n\nDetails here')
    expect(section).toContain('Injected failure context')
    expect(section).toContain('Details here')
  })

  it('clears stale failure context files', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-ctx-'))
    fs.writeFileSync(failureContextPath(tmpDir), '# stale', 'utf8')
    clearFailureContext(tmpDir)
    expect(fs.existsSync(failureContextPath(tmpDir))).toBe(false)
  })
})

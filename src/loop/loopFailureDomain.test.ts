import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FAILURE_DOMAINS_FILENAME,
  appendFailureDomain,
  failureDomainsPath,
  logFailureDomainFromVerify,
} from './loopFailureDomain.js'

describe('loopFailureDomain', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('appends failure domain entries to ndjson', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-domain-'))
    logFailureDomainFromVerify(tmpDir, {
      iteration: 3,
      reason: 'stagnation',
      verify: {
        complete: false,
        command: 'vitest run',
        exitCode: 1,
        stdout: 'FAIL same',
        stderr: '',
        reason: 'Verifier failed',
      },
      repeatCount: 3,
    })

    const filePath = failureDomainsPath(tmpDir)
    expect(fs.existsSync(filePath)).toBe(true)
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const entry = JSON.parse(lines[0]!) as { reason: string; suggestion: string }
    expect(entry.reason).toBe('stagnation')
    expect(entry.suggestion).toMatch(/Same verifier output/)
    expect(FAILURE_DOMAINS_FILENAME).toBe('failure-domains.ndjson')
  })

  it('supports custom suggestions', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'failure-domain-'))
    appendFailureDomain(tmpDir, {
      iteration: 1,
      reason: 'review_gate',
      fingerprint: 'test|1|out',
      verify: { command: 'true', exitCode: 0, reason: 'ok' },
      suggestion: 'Custom hint',
    })
    const entry = JSON.parse(fs.readFileSync(failureDomainsPath(tmpDir), 'utf8').trim())
    expect(entry.suggestion).toBe('Custom hint')
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertLoopCredentials,
  listMissingLoopCredentials,
  requiredCredentialNeed,
} from './loopCredentialPreflight.js'

const tmpHomes: string[] = []

afterEach(() => {
  for (const dir of tmpHomes.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('loopCredentialPreflight', () => {
  it('requires CURSOR_API_KEY for a Cursor judge even when the worker is OpenCode', () => {
    const missing = listMissingLoopCredentials(
      {
        runtime: 'opencode',
        reviewRuntime: 'cursor',
        postQualityReview: 'auto',
      },
      {},
    )
    expect(missing).toEqual([
      { role: 'judge', runtime: 'cursor', need: 'CURSOR_API_KEY' },
    ])
    expect(() =>
      assertLoopCredentials(
        {
          runtime: 'opencode',
          reviewRuntime: 'cursor',
          postQualityReview: 'auto',
        },
        {},
      ),
    ).toThrow(/Missing credentials — aborting before WORKER/)
  })

  it('passes when the Cursor judge key is present', () => {
    expect(
      listMissingLoopCredentials(
        {
          runtime: 'opencode',
          reviewRuntime: 'cursor',
          postQualityReview: 'auto',
        },
        { CURSOR_API_KEY: 'k' },
      ),
    ).toEqual([])
  })

  it('skips the judge key when postQualityReview is off', () => {
    expect(
      listMissingLoopCredentials(
        {
          runtime: 'opencode',
          reviewRuntime: 'cursor',
          postQualityReview: false,
        },
        {},
      ),
    ).toEqual([])
  })

  it('requires CLINE_API_KEY for a Cline worker', () => {
    expect(requiredCredentialNeed('cline', {})).toBe('CLINE_API_KEY')
    expect(requiredCredentialNeed('cline-pass', { CLINE_API_KEY: 'x' })).toBeUndefined()
  })

  it('does not require env keys for OpenCode / DSH / Codex / Muse', () => {
    expect(requiredCredentialNeed('opencode', {})).toBeUndefined()
    expect(requiredCredentialNeed('dsh', {})).toBeUndefined()
    expect(requiredCredentialNeed('codex', {})).toBeUndefined()
    expect(requiredCredentialNeed('muse', {})).toBeUndefined()
    expect(requiredCredentialNeed('claude', {})).toBeUndefined()
  })

  it('aborts a DSH worker on a wrapped credentials store before WORKER', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-loop-creds-'))
    tmpHomes.push(dir)
    fs.writeFileSync(
      path.join(dir, '.credentials.yaml'),
      'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-secret-do-not-leak\n',
      { encoding: 'utf8', mode: 0o600 },
    )
    expect(() =>
      assertLoopCredentials(
        { runtime: 'dsh', postQualityReview: false },
        { DSH_HOME: dir },
      ),
    ).toThrow(/aborting before WORKER/)
    expect(() =>
      assertLoopCredentials(
        { runtime: 'dsh', postQualityReview: false },
        { DSH_HOME: dir },
      ),
    ).toThrow(/wrapped store/)
  })
})

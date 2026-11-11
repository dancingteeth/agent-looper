import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertLoopCredentials,
  formatMissingLoopCredentials,
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

  it('unset reviewRuntime follows the worker: no phantom Cursor judge key for an OpenCode or Claude loop', () => {
    for (const runtime of ['opencode', 'claude'] as const) {
      expect(listMissingLoopCredentials({ runtime, postQualityReview: 'auto' }, {})).toEqual([])
    }
    expect(listMissingLoopCredentials({ runtime: 'cursor', postQualityReview: 'auto' }, {})).toEqual([
      { role: 'worker', runtime: 'cursor', need: 'CURSOR_API_KEY' },
      { role: 'judge', runtime: 'cursor', need: 'CURSOR_API_KEY' },
    ])
  })

  it('requires DEEPSEEK_API_KEY in env for DSH (headless ignores the credentials file)', () => {
    expect(requiredCredentialNeed('dsh', {})).toBe('DEEPSEEK_API_KEY')
    expect(requiredCredentialNeed('dsh', { DEEPSEEK_API_KEY: 'sk-x' })).toBeUndefined()
    const message = formatMissingLoopCredentials(
      listMissingLoopCredentials({ runtime: 'dsh', reviewRuntime: 'claude', postQualityReview: 'auto' }, {}),
    )
    expect(message).toMatch(/worker \(dsh\): DEEPSEEK_API_KEY is not set/)
    expect(message).toMatch(/does not read ~\/\.dsh\/\.credentials\.yaml/)
    expect(() =>
      assertLoopCredentials({ runtime: 'dsh', postQualityReview: false }, { DSH_HOME: '/nonexistent' }),
    ).toThrow(/DEEPSEEK_API_KEY is not set/)
  })

  it('does not require env keys for OpenCode / Codex / Muse / Claude', () => {
    expect(requiredCredentialNeed('opencode', {})).toBeUndefined()
    expect(requiredCredentialNeed('codex', {})).toBeUndefined()
    expect(requiredCredentialNeed('muse', {})).toBeUndefined()
    expect(requiredCredentialNeed('claude', {})).toBeUndefined()
  })

  it('aborts a DSH worker on a credentials store DSH cannot boot', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-loop-creds-'))
    tmpHomes.push(dir)
    const store = path.join(dir, '.credentials.yaml')
    const run = () =>
      assertLoopCredentials(
        { runtime: 'dsh', postQualityReview: false },
        { DSH_HOME: dir, DEEPSEEK_API_KEY: 'sk-test' },
      )
    fs.writeFileSync(store, 'version: "1"\nrefs:\n  DEEPSEEK_API_KEY: sk-secret-do-not-leak\n', {
      encoding: 'utf8',
      mode: 0o600,
    })
    expect(run).toThrow(/aborting before WORKER/)
    expect(run).toThrow(/layout v1/)
    fs.writeFileSync(store, 'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-test\n', {
      encoding: 'utf8',
      mode: 0o600,
    })
    expect(run).not.toThrow(/aborting before WORKER/)
  })
})

import { describe, expect, it } from 'vitest'
import {
  assertLoopCredentials,
  listMissingLoopCredentials,
  requiredCredentialNeed,
} from './loopCredentialPreflight.js'

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
  })
})

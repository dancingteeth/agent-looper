import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DSH_CREDENTIALS_LAYOUT_HINT,
  assertDshCredentialsStore,
  dshCredentialsDocumentProblem,
} from './dshCredentialsStore.js'

const tmpDirs: string[] = []

function tmpStore(body: string | undefined): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-creds-'))
  tmpDirs.push(dir)
  const filename = path.join(dir, '.credentials.yaml')
  if (body !== undefined) fs.writeFileSync(filename, body, { encoding: 'utf8', mode: 0o600 })
  return filename
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('dshCredentialsDocumentProblem', () => {
  it('accepts a flat quoted API key (DSH migrates the pre-release layout)', () => {
    expect(dshCredentialsDocumentProblem('DEEPSEEK_API_KEY: "sk-test"\n')).toBeUndefined()
  })

  it('accepts an empty document', () => {
    expect(dshCredentialsDocumentProblem('')).toBeUndefined()
    expect(dshCredentialsDocumentProblem('# comment only\n')).toBeUndefined()
  })

  it('accepts layout v1 with refs and DSH-owned records (what dsh web writes)', () => {
    const text = [
      'version: 1',
      'refs:',
      '  DEEPSEEK_API_KEY: sk-test',
      'records:',
      '  client-connection/browser-session:',
      '    kind: secret',
      '    payload:',
      '      version: 1',
      '      secret: abc',
      '',
    ].join('\n')
    expect(dshCredentialsDocumentProblem(text)).toBeUndefined()
  })

  it('accepts version 1 with no refs yet', () => {
    expect(dshCredentialsDocumentProblem('version: 1\n')).toBeUndefined()
  })

  it('rejects a quoted or unknown version', () => {
    expect(dshCredentialsDocumentProblem('version: "1"\nrefs:\n  K: "v"\n')).toBe(
      DSH_CREDENTIALS_LAYOUT_HINT,
    )
    expect(dshCredentialsDocumentProblem('version: 2\n')).toBe(DSH_CREDENTIALS_LAYOUT_HINT)
  })

  it('rejects non-string or non-POSIX refs', () => {
    expect(dshCredentialsDocumentProblem('version: 1\nrefs:\n  DEEPSEEK_API_KEY: 123\n')).toBe(
      DSH_CREDENTIALS_LAYOUT_HINT,
    )
    expect(dshCredentialsDocumentProblem('version: 1\nrefs:\n  bad-key: "x"\n')).toBe(
      DSH_CREDENTIALS_LAYOUT_HINT,
    )
    expect(dshCredentialsDocumentProblem('version: 1\nrefs:\n  K:\n    nested: "x"\n')).toBe(
      DSH_CREDENTIALS_LAYOUT_HINT,
    )
  })

  it('rejects a flat store DSH cannot migrate', () => {
    expect(dshCredentialsDocumentProblem('client-connection/browser-session: "x"\n')).toBe(
      DSH_CREDENTIALS_LAYOUT_HINT,
    )
    expect(dshCredentialsDocumentProblem('DEEPSEEK_API_KEY: 42\n')).toBe(DSH_CREDENTIALS_LAYOUT_HINT)
  })
})

describe('assertDshCredentialsStore', () => {
  it('no-ops when the file is missing', () => {
    const filename = path.join(os.tmpdir(), `dsh-creds-missing-${process.pid}.yaml`)
    expect(() => assertDshCredentialsStore({ filename })).not.toThrow()
  })

  it('throws the layout hint without echoing values', () => {
    const filename = tmpStore('version: "1"\nrefs:\n  DEEPSEEK_API_KEY: sk-secret-do-not-leak\n')
    expect(() => assertDshCredentialsStore({ filename })).toThrow(/aborting before WORKER/)
    try {
      assertDshCredentialsStore({ filename })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain(DSH_CREDENTIALS_LAYOUT_HINT)
      expect(message).not.toContain('sk-secret')
    }
  })

  it('accepts a flat store and a v1 store', () => {
    expect(() => assertDshCredentialsStore({ filename: tmpStore('DEEPSEEK_API_KEY: "sk-test"\n') })).not.toThrow()
    expect(() =>
      assertDshCredentialsStore({ filename: tmpStore('version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-test\n') }),
    ).not.toThrow()
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DSH_CREDENTIALS_FLAT_HINT,
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
  it('accepts a flat quoted API key', () => {
    expect(dshCredentialsDocumentProblem('DEEPSEEK_API_KEY: "sk-test"\n')).toBeUndefined()
  })

  it('accepts an empty document', () => {
    expect(dshCredentialsDocumentProblem('')).toBeUndefined()
    expect(dshCredentialsDocumentProblem('# comment only\n')).toBeUndefined()
  })

  it('rejects the wrapped version/refs/records store', () => {
    const text = [
      'version: "1"',
      'refs:',
      '  DEEPSEEK_API_KEY: sk-test',
      'records:',
      '  client-connection/browser-session:',
      '    payload:',
      '      version: 1',
      '',
    ].join('\n')
    expect(dshCredentialsDocumentProblem(text)).toBe(DSH_CREDENTIALS_FLAT_HINT)
  })

  it('rejects an unquoted YAML integer at root', () => {
    expect(dshCredentialsDocumentProblem('version: 1\n')).toBe(DSH_CREDENTIALS_FLAT_HINT)
  })

  it('rejects a non-POSIX root key', () => {
    expect(dshCredentialsDocumentProblem('client-connection/browser-session: "x"\n')).toBe(
      DSH_CREDENTIALS_FLAT_HINT,
    )
  })
})

describe('assertDshCredentialsStore', () => {
  it('no-ops when the file is missing', () => {
    const filename = path.join(os.tmpdir(), `dsh-creds-missing-${process.pid}.yaml`)
    expect(() => assertDshCredentialsStore({ filename })).not.toThrow()
  })

  it('throws the flatten hint for a wrapped store without echoing values', () => {
    const filename = tmpStore('version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-secret-do-not-leak\n')
    expect(() => assertDshCredentialsStore({ filename })).toThrow(/aborting before WORKER/)
    try {
      assertDshCredentialsStore({ filename })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      expect(message).toContain(DSH_CREDENTIALS_FLAT_HINT)
      expect(message).not.toContain('sk-secret')
    }
  })

  it('accepts a flat store', () => {
    const filename = tmpStore('DEEPSEEK_API_KEY: "sk-test"\n')
    expect(() => assertDshCredentialsStore({ filename })).not.toThrow()
  })
})

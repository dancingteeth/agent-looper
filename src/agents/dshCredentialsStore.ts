import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveDshHome } from './dshSessionUsage.js'

/** Same one-liner for preflight, agent-check, and collapsed headless stderr. */
export const DSH_CREDENTIALS_FLAT_HINT =
  '~/.dsh/.credentials.yaml must be a flat KEY: "string" map ' +
  '(DEEPSEEK_API_KEY: "…"). A wrapped store (version/refs/records) or YAML integer (version: 1) fails boot.'

const WRAPPED_ROOT_KEYS = new Set(['version', 'refs', 'records'])

/** DSH `credentialRef`: POSIX identifier. */
const POSIX_CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

const UNQUOTED_NON_STRING = /^(?:[-+]?\d+(?:\.\d+)?|true|false|null|~|\{|\[|\||>)/i

export function dshCredentialsFilename(
  env: NodeJS.ProcessEnv = process.env,
  homedir = os.homedir(),
): string {
  return path.join(resolveDshHome(env, homedir), '.credentials.yaml')
}

function rootKeyName(line: string): string | undefined {
  if (/^[ \t]/.test(line)) return undefined
  const trimmed = line.trimEnd()
  if (trimmed.length === 0 || trimmed.startsWith('#') || trimmed === '---' || trimmed === '...') {
    return undefined
  }
  const quoted = /^["']([^"']+)["']\s*:/.exec(trimmed)
  if (quoted) return quoted[1]
  const plain = /^([^:#\s][^:]*)\s*:/.exec(trimmed)
  return plain?.[1]?.trim()
}

function rootValuePrefix(line: string): string {
  const colon = line.indexOf(':')
  if (colon < 0) return ''
  return line.slice(colon + 1).replace(/\s+#.*$/, '').trim()
}

/**
 * Structure-only scan. Never returns document values.
 * Absent / empty documents are OK (DSH treats them as an empty store).
 */
export function dshCredentialsDocumentProblem(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const key = rootKeyName(raw)
    if (key === undefined) continue
    if (WRAPPED_ROOT_KEYS.has(key) || !POSIX_CREDENTIAL_REF.test(key)) {
      return DSH_CREDENTIALS_FLAT_HINT
    }
    const value = rootValuePrefix(raw)
    if (value.length === 0) continue
    if (value.startsWith('"') || value.startsWith("'")) continue
    if (UNQUOTED_NON_STRING.test(value)) return DSH_CREDENTIALS_FLAT_HINT
  }
  return undefined
}

export type AssertDshCredentialsStoreOptions = {
  env?: NodeJS.ProcessEnv
  homedir?: string
  filename?: string
}

/** Fail before spawning headless when the on-disk store cannot boot. */
export function assertDshCredentialsStore(options: AssertDshCredentialsStoreOptions = {}): void {
  const filename = options.filename ?? dshCredentialsFilename(options.env, options.homedir)
  let text: string
  try {
    text = fs.readFileSync(filename, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return
    throw error
  }
  const problem = dshCredentialsDocumentProblem(text)
  if (problem === undefined) return
  throw new Error(`DSH credentials store is not flat — aborting before WORKER. ${problem}`)
}

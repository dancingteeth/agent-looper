import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveDshHome } from './dshSessionUsage.js'

/**
 * Same one-liner for preflight, agent-check, and collapsed headless stderr.
 * DSH >= 0.2.1 `credentials-local` reads layout v1 and auto-migrates the
 * pre-release flat map, so both shapes boot; anything else fails boot.
 */
export const DSH_CREDENTIALS_LAYOUT_HINT =
  '~/.dsh/.credentials.yaml must be DSH layout v1: `version: 1` (unquoted integer) with ' +
  '`refs:` holding KEY: "string" entries (DEEPSEEK_API_KEY: "…"). ' +
  'A flat KEY: "string" map is also accepted (DSH migrates it).'

/** DSH `credentialRef`: POSIX identifier. */
const POSIX_CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

const UNQUOTED_NON_STRING = /^(?:[-+]?\d+(?:\.\d+)?|true|false|null|~|\{|\[|\||>)/i

export function dshCredentialsFilename(
  env: NodeJS.ProcessEnv = process.env,
  homedir = os.homedir(),
): string {
  return path.join(resolveDshHome(env, homedir), '.credentials.yaml')
}

type KeyLine = { indent: number; key: string; value: string }

function parseKeyLine(raw: string): KeyLine | undefined {
  const trimmed = raw.trimEnd()
  const body = trimmed.trimStart()
  if (body.length === 0 || body.startsWith('#') || body === '---' || body === '...') {
    return undefined
  }
  const indent = trimmed.length - body.length
  const quoted = /^["']([^"']+)["']\s*:(.*)$/.exec(body)
  const plain = quoted ? undefined : /^([^:#\s][^:]*?)\s*:(?:\s(.*)|)$/.exec(body)
  const match = quoted ?? plain
  if (!match) return undefined
  const value = (match[2] ?? '').replace(/\s+#.*$/, '').trim()
  return { indent, key: match[1]!.trim(), value }
}

/** Value prefix that DSH would not read as a non-empty string scalar. */
function notAString(value: string): boolean {
  if (value.length === 0) return true
  if (value.startsWith('"') || value.startsWith("'")) return /^(""|'')$/.test(value)
  return UNQUOTED_NON_STRING.test(value)
}

/**
 * Structure-only scan. Never returns document values.
 * Absent / empty documents are OK (DSH treats them as an empty store).
 */
export function dshCredentialsDocumentProblem(text: string): string | undefined {
  const lines = text
    .split(/\r?\n/)
    .map(parseKeyLine)
    .filter((line): line is KeyLine => line !== undefined)
  const roots = lines.filter((line) => line.indent === 0)
  if (roots.length === 0) return undefined

  const version = roots.find((line) => line.key === 'version')
  if (version === undefined) {
    // Pre-release flat layout: DSH migrates it when every entry is a ref → string.
    for (const line of roots) {
      if (!POSIX_CREDENTIAL_REF.test(line.key) || notAString(line.value)) {
        return DSH_CREDENTIALS_LAYOUT_HINT
      }
    }
    return undefined
  }

  if (version.value !== '1') return DSH_CREDENTIALS_LAYOUT_HINT
  let section: string | undefined
  let childIndent: number | undefined
  for (const line of lines) {
    if (line.indent === 0) {
      section = line.key
      childIndent = undefined
      if (section === 'refs' && line.value.length > 0 && line.value !== '{}') {
        return DSH_CREDENTIALS_LAYOUT_HINT
      }
      continue
    }
    if (section !== 'refs') continue // records are DSH-owned; other roots are ignored by DSH
    childIndent ??= line.indent
    if (line.indent !== childIndent) return DSH_CREDENTIALS_LAYOUT_HINT
    if (!POSIX_CREDENTIAL_REF.test(line.key) || notAString(line.value)) {
      return DSH_CREDENTIALS_LAYOUT_HINT
    }
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
  throw new Error(`DSH credentials store will not boot — aborting before WORKER. ${problem}`)
}

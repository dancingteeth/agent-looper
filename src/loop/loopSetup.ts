import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { attachVerifyClass, VERIFY_CLASS_ENV } from './verifyClass.js'
import type { VerifyResult } from './loopVerify.js'

export const SETUP_LOG_FILENAME = 'setup.log'
export const SETUP_SCRIPT_FILENAME = 'setup.sh'

const MAX_CAPTURE = 64 * 1024
const MAX_SPAWN_BUFFER = 1024 * 1024

function truncate(text: string, max = MAX_CAPTURE): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n…(truncated)`
}

function runSetupShell(command: string, cwd: string): VerifyResult {
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    maxBuffer: MAX_SPAWN_BUFFER,
    env: process.env,
  })

  const stdout = truncate(result.stdout ?? '')
  const stderr = truncate(result.stderr ?? '')
  const exitCode = result.status
  const complete = exitCode === 0

  let reason = complete ? 'Setup passed (exit 0).' : `Setup failed (exit ${exitCode ?? 'null'}).`
  if (result.error) {
    reason = `Setup error: ${result.error.message}`
  }

  const classified = attachVerifyClass({
    complete,
    command,
    exitCode,
    stdout,
    stderr,
    reason,
  })
  if (classified.complete) return classified
  return { ...classified, verifyClass: VERIFY_CLASS_ENV }
}

/**
 * Explicit `loop.json` `setup`, or `setup.sh` beside GOAL.md when that file exists.
 */
export function resolveLoopSetupCommand(
  loopDir: string,
  repoRoot: string,
  setup?: string,
): string | undefined {
  if (setup?.trim()) return setup.trim()
  const setupSh = path.join(loopDir, SETUP_SCRIPT_FILENAME)
  if (!fs.existsSync(setupSh)) return undefined
  const rel = path.relative(repoRoot, setupSh).split(path.sep).join('/')
  const script = rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : setupSh
  return `bash ${script}`
}

export function persistSetupLog(loopDir: string, setup: VerifyResult): string {
  const logPath = path.join(loopDir, SETUP_LOG_FILENAME)
  const body = [
    `# setup ${setup.complete ? 'PASS' : 'FAIL'} (exit ${setup.exitCode ?? 'null'})`,
    `# command: ${setup.command}`,
    `# ${setup.reason}`,
    '',
    '--- stdout ---',
    setup.stdout,
    '--- stderr ---',
    setup.stderr,
    '',
  ].join('\n')
  fs.writeFileSync(logPath, body, 'utf8')
  return logPath
}

export function runLoopSetup(command: string, cwd: string, loopDir: string): VerifyResult {
  const result = runSetupShell(command, cwd)
  persistSetupLog(loopDir, result)
  return result
}

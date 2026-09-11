import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  persistSetupLog,
  resolveLoopSetupCommand,
  runLoopSetup,
  SETUP_LOG_FILENAME,
  SETUP_SCRIPT_FILENAME,
} from './loopSetup.js'
import { VERIFY_CLASS_ENV, VERIFY_ENV_EXIT_CODE } from './verifyClass.js'

describe('resolveLoopSetupCommand', () => {
  let tmpDir: string
  let repoRoot: string

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
    if (repoRoot && repoRoot !== tmpDir) fs.rmSync(repoRoot, { recursive: true, force: true })
  })

  it('uses explicit loop.json setup', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-setup-'))
    expect(resolveLoopSetupCommand(tmpDir, tmpDir, 'pnpm install --frozen-lockfile')).toBe(
      'pnpm install --frozen-lockfile',
    )
  })

  it('discovers setup.sh beside the bundle', () => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-setup-repo-'))
    tmpDir = path.join(repoRoot, '.cursor', 'loops', 'task')
    fs.mkdirSync(tmpDir, { recursive: true })
    fs.writeFileSync(path.join(tmpDir, SETUP_SCRIPT_FILENAME), '#!/bin/sh\nexit 0\n')
    expect(resolveLoopSetupCommand(tmpDir, repoRoot)).toBe(
      'bash .cursor/loops/task/setup.sh',
    )
  })

  it('returns undefined when neither setup nor setup.sh exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-setup-'))
    expect(resolveLoopSetupCommand(tmpDir, tmpDir)).toBeUndefined()
  })
})

describe('runLoopSetup', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes setup.log and classifies failure as env', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-setup-run-'))
    const result = runLoopSetup(`sh -c 'exit ${VERIFY_ENV_EXIT_CODE}'`, tmpDir, tmpDir)
    expect(result.complete).toBe(false)
    expect(result.verifyClass).toBe(VERIFY_CLASS_ENV)
    expect(fs.existsSync(path.join(tmpDir, SETUP_LOG_FILENAME))).toBe(true)
    expect(fs.readFileSync(path.join(tmpDir, SETUP_LOG_FILENAME), 'utf8')).toContain('FAIL')
  })

  it('passes on exit 0', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-setup-run-'))
    const result = runLoopSetup('true', tmpDir, tmpDir)
    expect(result.complete).toBe(true)
    persistSetupLog(tmpDir, result)
    expect(fs.readFileSync(path.join(tmpDir, SETUP_LOG_FILENAME), 'utf8')).toContain('PASS')
  })
})

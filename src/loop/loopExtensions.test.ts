import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loopConfigSchema } from './loopConfig.js'
import {
  VERIFY_SIDECAR_DIR,
  detectExternalVerifierPaths,
  formatLoopExtensionPreflight,
  persistVerifyOutput,
  validateLoopExtensionPreflight,
} from './loopExtensions.js'
import { repoProfileSchema } from '../context/repoProfile.js'

describe('loop extension schema', () => {
  it('accepts reserved extension fields on loop.json', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'pnpm test',
      smokeScripts: ['bash -n ops/publish.sh'],
      siblingRepos: [{ path: '../aeo-research-ingest', label: 'ingest' }],
      verifyPreflight: 'test -d ../aeo-research-ingest',
      verifyLogMode: 'sidecar',
      skillDisclosure: 'inline',
    })
    expect(parsed.smokeScripts).toHaveLength(1)
    expect(parsed.siblingRepos?.[0]?.path).toBe('../aeo-research-ingest')
    expect(parsed.verifyLogMode).toBe('sidecar')
    expect(parsed.skillDisclosure).toBe('inline')
  })
})

describe('detectExternalVerifierPaths', () => {
  it('flags sibling paths referenced in verify', () => {
    const repoRoot = '/Users/me/Projects/aeogeo.site'
    const paths = detectExternalVerifierPaths(
      'test -f ../aeo-research-ingest/scripts/foo.rb && pnpm test',
      repoRoot,
    )
    expect(paths.some((p) => p.includes('aeo-research-ingest'))).toBe(true)
  })

  it('ignores in-repo relative paths', () => {
    const repoRoot = process.cwd()
    const paths = detectExternalVerifierPaths('pnpm test && test -f packages/foo/bar.ts', repoRoot)
    expect(paths).toHaveLength(0)
  })
})

describe('validateLoopExtensionPreflight', () => {
  it('notes pending features and warns on missing sibling path', () => {
    const config = loopConfigSchema.parse({
      verify: 'pnpm test',
      smokeScripts: ['true'],
      siblingRepos: [{ path: '../definitely-missing-sibling-repo-xyz' }],
    })
    const result = validateLoopExtensionPreflight(
      { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      config,
    )
    expect(result.pendingFeatures.some((f) => f.includes('smokeScripts'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('siblingRepos path missing'))).toBe(true)
  })

  it('does not treat sidecar verify logs as a reserved pending feature', () => {
    const config = loopConfigSchema.parse({
      verify: 'pnpm test',
      verifyLogMode: 'sidecar',
    })
    const result = validateLoopExtensionPreflight(
      { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      config,
    )
    expect(result.pendingFeatures.some((f) => f.includes('verifyLogMode'))).toBe(false)
  })

  it('formats extension preflight warnings and pending features', () => {
    const formatted = formatLoopExtensionPreflight({
      warnings: ['verify references paths outside repo'],
      pendingFeatures: ['smokeScripts'],
    })
    expect(formatted).toContain('warn: verify references paths outside repo')
    expect(formatted).toContain('note: smokeScripts configured')
  })
})

describe('persistVerifyOutput sidecar', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes full logs and returns a preview plus path', () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-sidecar-'))
    dirs.push(loopDir)
    const stdout = `${'ok '.repeat(400)}END`
    const persisted = persistVerifyOutput(
      loopDir,
      2,
      {
        complete: false,
        command: 'bash verify.sh',
        exitCode: 1,
        stdout,
        stderr: 'boom',
        reason: 'fail',
      },
      'sidecar',
    )
    const stdoutPath = path.join(loopDir, VERIFY_SIDECAR_DIR, 'iter-2.verify.stdout.txt')
    const stderrPath = path.join(loopDir, VERIFY_SIDECAR_DIR, 'iter-2.verify.stderr.txt')
    expect(fs.readFileSync(stdoutPath, 'utf8')).toBe(stdout)
    expect(fs.readFileSync(stderrPath, 'utf8')).toBe('boom')
    expect(persisted.verify.stdout).toContain('[full output:')
    expect(persisted.verify.stdout).toContain(stdoutPath)
    expect(persisted.verify.stdout.length).toBeLessThan(stdout.length)
    expect(persisted.verify.stderr).toContain(stderrPath)
    expect(persisted.verifyLog).toEqual({ stdoutPath, stderrPath })
  })

  it('leaves inline verify untouched', () => {
    const verify = {
      complete: true,
      command: 'true',
      exitCode: 0,
      stdout: 'all good',
      stderr: '',
      reason: 'ok',
    }
    expect(persistVerifyOutput('/unused', 1, verify, 'inline')).toEqual({ verify })
  })
})

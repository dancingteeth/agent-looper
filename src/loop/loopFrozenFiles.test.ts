import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FROZEN_FILES_VERIFY_COMMAND,
  frozenFilesVerifyResult,
  restoreFrozenFiles,
  snapshotFrozenFiles,
} from './loopFrozenFiles.js'

describe('loopFrozenFiles', () => {
  let tmpDir: string

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('restores mutated GOAL.md and leaves other files alone', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-frozen-'))
    const loopDir = path.join(tmpDir, 'loop')
    fs.mkdirSync(loopDir)
    fs.writeFileSync(path.join(loopDir, 'GOAL.md'), 'original goal\n')
    fs.writeFileSync(path.join(loopDir, 'loop.json'), '{"verify":"true"}\n')
    fs.writeFileSync(path.join(tmpDir, 'src.ts'), 'keep me\n')

    const snap = snapshotFrozenFiles(loopDir, tmpDir)
    fs.writeFileSync(path.join(loopDir, 'GOAL.md'), 'gamed goal\n')
    fs.writeFileSync(path.join(tmpDir, 'src.ts'), 'also edited\n')

    const restored = restoreFrozenFiles(snap)
    expect(restored.restored).toEqual(['loop/GOAL.md'])
    expect(fs.readFileSync(path.join(loopDir, 'GOAL.md'), 'utf8')).toBe('original goal\n')
    expect(fs.readFileSync(path.join(tmpDir, 'src.ts'), 'utf8')).toBe('also edited\n')
  })

  it('recreates a deleted frozen file', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-frozen-'))
    const loopDir = path.join(tmpDir, 'loop')
    fs.mkdirSync(loopDir)
    fs.writeFileSync(path.join(loopDir, 'verify.sh'), 'exit 0\n')
    const snap = snapshotFrozenFiles(loopDir, tmpDir)
    fs.unlinkSync(path.join(loopDir, 'verify.sh'))
    const restored = restoreFrozenFiles(snap)
    expect(restored.restored).toEqual(['loop/verify.sh'])
    expect(fs.readFileSync(path.join(loopDir, 'verify.sh'), 'utf8')).toBe('exit 0\n')
  })

  it('builds a product-fail verify result', () => {
    const result = frozenFilesVerifyResult(['loop/GOAL.md'])
    expect(result.complete).toBe(false)
    expect(result.command).toBe(FROZEN_FILES_VERIFY_COMMAND)
    expect(result.verifyClass).toBe('product')
  })
})

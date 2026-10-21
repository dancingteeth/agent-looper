import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  LESSONS_MAX_CHARS,
  buildLessonsPromptSection,
  lessonsPath,
  readLessons,
  recordGreenRunLessons,
} from './loopLessons.js'
import type { VerifyResult } from './loopVerify.js'

describe('loopLessons', () => {
  let loopDir: string

  afterEach(() => {
    if (loopDir) fs.rmSync(loopDir, { recursive: true, force: true })
  })

  it('buildLessonsPromptSection includes heading and body', () => {
    const section = buildLessonsPromptSection('alpha lesson')
    expect(section).toContain('## Lessons from earlier green runs')
    expect(section).toContain('alpha lesson')
  })

  it('recordGreenRunLessons writes verify command and first failure line', () => {
    loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-lessons-'))
    const fail: VerifyResult = {
      complete: false,
      command: 'bash verify.sh',
      exitCode: 1,
      stdout: '\nFAIL first-line\nsecond',
      stderr: '',
      reason: 'fail',
    }
    recordGreenRunLessons(loopDir, {
      verifyCommand: 'bash verify.sh',
      iterations: 2,
      failuresOvercome: [fail],
    })
    const text = readLessons(loopDir)
    expect(text).toContain('bash verify.sh')
    expect(text).toContain('FAIL first-line')
    expect(fs.existsSync(lessonsPath(loopDir))).toBe(true)
  })

  it('caps file size and keeps newest gotchas', () => {
    loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-lessons-cap-'))
    for (let run = 0; run < 50; run++) {
      recordGreenRunLessons(loopDir, {
        verifyCommand: 'bash verify.sh',
        iterations: 1,
        failuresOvercome: [
          {
            complete: false,
            command: 'bash verify.sh',
            exitCode: 1,
            stdout: `FAIL gotcha-${run} ${'x'.repeat(120)}`,
            stderr: '',
            reason: 'fail',
          },
        ],
      })
    }
    const text = fs.readFileSync(lessonsPath(loopDir), 'utf8')
    expect(text.length).toBeLessThanOrEqual(LESSONS_MAX_CHARS)
    expect(text).toContain('bash verify.sh')
    expect(text).toContain('gotcha-49')
    expect(text).not.toContain('gotcha-0 ')
  })

  it('keeps a verify command containing a backtick intact when the cap trims gotchas', () => {
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-lessons-bt-'))
    const verifyCommand = 'bash -c "echo `hi`"'
    for (let run = 0; run < 50; run++) {
      recordGreenRunLessons(loopDir, {
        verifyCommand,
        iterations: 1,
        failuresOvercome: [
          { complete: false, command: verifyCommand, exitCode: 1, stdout: `FAIL bt-${run} ${'y'.repeat(150)}`, stderr: '', reason: 'fail' },
        ],
      })
    }
    const text = fs.readFileSync(lessonsPath(loopDir), 'utf8')
    expect(text.length).toBeLessThanOrEqual(LESSONS_MAX_CHARS)
    expect(text).toContain(`Verify command: \`${verifyCommand}\``)
    expect(text).toContain('bt-49')
  })
})

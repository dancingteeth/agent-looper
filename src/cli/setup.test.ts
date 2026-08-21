import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pickLoopConfigFields, runWizard, usage } from './setup.js'

const dirs: string[] = []

function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('agent-loop-setup', () => {
  it('lists dsh and review/notify/git in --help text', () => {
    const text = usage()
    expect(text).toMatch(/\bdsh\b/)
    expect(text).toMatch(/review/i)
    expect(text).toMatch(/notify|telegram/i)
    expect(text).toMatch(/git|pr|branch|comment/i)
  })

  it('writes a dsh worker+judge loop.json without a reviewModel key', () => {
    const outDir = tmpDir('agent-loop-setup-dsh-')
    const code = runWizard(
      {
        runtime: 'dsh',
        reviewRuntime: 'dsh',
        model: 'deepseek-official/deepseek-v4-flash',
        escalateModel: 'deepseek-official/deepseek-v4-pro',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.runtime).toBe('dsh')
    expect(written.reviewRuntime).toBe('dsh')
    expect(written).not.toHaveProperty('reviewModel')
  })

  it('round-trips notifyTelegram false and notifyPrComment true', () => {
    const outDir = tmpDir('agent-loop-setup-notify-')
    const code = runWizard(
      {
        runtime: 'opencode',
        model: 'opencode-go/deepseek-v4-flash',
        notifyTelegram: false,
        notifyPrComment: true,
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(0)
    const written = JSON.parse(fs.readFileSync(path.join(outDir, 'loop.json'), 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.notifyTelegram).toBe(false)
    expect(written.notifyPrComment).toBe(true)
  })

  it('rejects an unknown runtime and does not write loop.json', () => {
    const outDir = tmpDir('agent-loop-setup-bad-')
    const code = runWizard(
      {
        runtime: 'banana',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
  })

  it('rejects a Fast cursor review model and does not write loop.json', () => {
    const outDir = tmpDir('agent-loop-setup-fast-')
    const code = runWizard(
      {
        runtime: 'cursor',
        model: 'composer-2.5',
        reviewRuntime: 'cursor',
        reviewModel: 'composer-fast-1',
        maxIterations: 5,
        verify: 'bash .cursor/loops/example/verify.sh',
      },
      outDir,
      tmpDir('agent-loop-setup-repo-'),
    )
    expect(code).toBe(1)
    expect(fs.existsSync(path.join(outDir, 'loop.json'))).toBe(false)
  })

  it('drops unknown answers keys instead of inventing schema fields', () => {
    expect(pickLoopConfigFields({ runtime: 'dsh', notAField: true, profile: {} })).toEqual({
      runtime: 'dsh',
    })
  })
})

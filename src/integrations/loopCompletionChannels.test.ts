import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import { postLoopCompletionChannels } from './loopCompletionChannels.js'

const {
  resolveNotifyCommand,
  runLoopNotifyCommand,
  sendNotifyWebhook,
  postLoopPrComment,
  formatLoopPrCommentBody,
} = vi.hoisted(() => ({
  resolveNotifyCommand: vi.fn(),
  runLoopNotifyCommand: vi.fn(),
  sendNotifyWebhook: vi.fn(async () => true),
  postLoopPrComment: vi.fn(() => 'https://example.test/pr#1'),
  formatLoopPrCommentBody: vi.fn(() => 'pr body'),
}))

vi.mock('./loopNotifyCommand.js', () => ({
  resolveNotifyCommand,
  runLoopNotifyCommand,
}))

vi.mock('./loopNotifyChannels.js', () => ({
  sendNotifyWebhook,
  postLoopPrComment,
  formatLoopPrCommentBody,
}))

const dirs: string[] = []

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-complete-'))
  dirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  vi.clearAllMocks()
})

describe('postLoopCompletionChannels', () => {
  it('returns the export pack when the loop export dir exists', async () => {
    const repoRoot = tmpDir()
    const loopDir = path.join(repoRoot, '.cursor', 'loops', 'demo')
    fs.mkdirSync(path.join(repoRoot, '.cursor', 'loop-exports', 'demo'), { recursive: true })
    resolveNotifyCommand.mockReturnValue(undefined)

    const result = await postLoopCompletionChannels({
      repoRoot,
      profile: repoProfileSchema.parse({}),
      kind: 'loop',
      bundleLabel: '.cursor/loops/demo',
      complete: true,
      exitCode: 0,
      reason: 'ok',
      loopDir,
    })

    expect(result.exportPackRel).toBe(path.join('.cursor', 'loop-exports', 'demo'))
    expect(runLoopNotifyCommand).not.toHaveBeenCalled()
    expect(postLoopPrComment).not.toHaveBeenCalled()
  })

  it('skips a missing loop export dir and still posts webhook', async () => {
    const repoRoot = tmpDir()
    resolveNotifyCommand.mockReturnValue(undefined)

    const result = await postLoopCompletionChannels({
      repoRoot,
      profile: repoProfileSchema.parse({}),
      kind: 'loop',
      bundleLabel: '.cursor/loops/missing',
      complete: false,
      exitCode: 2,
      reason: 'incomplete',
      loopDir: path.join(repoRoot, '.cursor', 'loops', 'missing'),
    })

    expect(result.exportPackRel).toBeUndefined()
    expect(sendNotifyWebhook).toHaveBeenCalled()
  })

  it('joins existing batch export packs, runs notifyCommand, and comments the PR', async () => {
    const repoRoot = tmpDir()
    const loopA = path.join(repoRoot, '.cursor', 'loops', 'a')
    const loopB = path.join(repoRoot, '.cursor', 'loops', 'b')
    fs.mkdirSync(path.join(repoRoot, '.cursor', 'loop-exports', 'a'), { recursive: true })
    fs.mkdirSync(path.join(repoRoot, '.cursor', 'loop-exports', 'b'), { recursive: true })
    resolveNotifyCommand.mockReturnValue('echo notify')

    const result = await postLoopCompletionChannels({
      repoRoot,
      profile: repoProfileSchema.parse({ notifyPrComment: true }),
      kind: 'batch',
      bundleLabel: 'batch',
      complete: true,
      exitCode: 0,
      reason: 'ok',
      loopDirs: [loopA, loopB],
      notifyCommand: 'echo loop-override',
    })

    expect(result.exportPackRel).toContain('loop-exports')
    expect(result.prCommentId).toBe('https://example.test/pr#1')
    expect(runLoopNotifyCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'echo notify',
        exportPack: result.exportPackRel,
      }),
    )
    expect(formatLoopPrCommentBody).toHaveBeenCalled()
    expect(postLoopPrComment).toHaveBeenCalled()
  })

  it('returns undefined for a batch with no loop dirs', async () => {
    const repoRoot = tmpDir()
    resolveNotifyCommand.mockReturnValue(undefined)

    const result = await postLoopCompletionChannels({
      repoRoot,
      profile: repoProfileSchema.parse({}),
      kind: 'batch',
      bundleLabel: 'empty',
      complete: true,
      exitCode: 0,
      reason: 'ok',
    })

    expect(result.exportPackRel).toBeUndefined()
  })
})

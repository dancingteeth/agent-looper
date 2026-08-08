import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import {
  collectLoopArtifacts,
  createHitlTasksFromFollowUps,
  discoverLoopBundles,
  extractHitlFollowUpBullets,
  isLoopBundleDir,
  parseTaskAddDescription,
  resolveMetaReviewOutputPath,
  runMetaReview,
} from './metaReview.js'

const { runCursorAgentPrompt } = vi.hoisted(() => ({
  runCursorAgentPrompt: vi.fn(),
}))

const { createHitlCheckpoint } = vi.hoisted(() => ({
  createHitlCheckpoint: vi.fn(),
}))

vi.mock('../agents/cursorAgent.js', () => ({
  runCursorAgentPrompt,
}))

vi.mock('../integrations/hitlCheckpoint.js', () => ({
  createHitlCheckpoint,
  hitlLoopOverridesFrom: vi.fn((c) => c),
}))

vi.mock('../context/defaultBranch.js', () => ({
  defaultBranchRefExists: () => true,
}))

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn((_cmd: string, args?: string[]) => {
    if (args?.[0] === 'merge-base') return 'abc123'
    if (args?.[0] === 'diff' && args.includes('--stat')) {
      return ' src/example.ts | 2 ++\n'
    }
    return 'abc123'
  }),
}))

function writeLoopBundle(root: string, name: string, files: Record<string, string>): string {
  const loopDir = path.join(root, name)
  fs.mkdirSync(loopDir, { recursive: true })
  fs.writeFileSync(path.join(loopDir, 'GOAL.md'), files.goal ?? `# ${name}\n`)
  fs.writeFileSync(path.join(loopDir, 'loop.json'), files.loopJson ?? '{"verify":"true"}')
  if (files.review) fs.writeFileSync(path.join(loopDir, 'review.md'), files.review)
  if (files.log) fs.writeFileSync(path.join(loopDir, 'log.ndjson'), files.log)
  if (files.failureDomains) {
    fs.writeFileSync(path.join(loopDir, 'failure-domains.ndjson'), files.failureDomains)
  }
  return loopDir
}

describe('metaReview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    runCursorAgentPrompt.mockResolvedValue({
      text: `### Cross-loop themes
- shared drift

### HITL follow-ups
- task add project:loops -- 'Manual cross-loop QA'

### Risk
**MEDIUM**

### Verdict
**ADVISORY**

### Blockers
- none`,
    })
    createHitlCheckpoint.mockResolvedValue('hitl-uuid-1')
  })

  it('detects loop bundles and discovers children of a parent dir', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-meta-discover-'))
    const a = writeLoopBundle(root, 'loop-a', {})
    const b = writeLoopBundle(root, 'loop-b', {})
    fs.mkdirSync(path.join(root, 'not-a-loop'), { recursive: true })

    expect(isLoopBundleDir(a)).toBe(true)
    expect(discoverLoopBundles([root], root)).toEqual([a, b])
    expect(discoverLoopBundles([a], root)).toEqual([a])
  })

  it('collects artifacts and notes missing files on stderr', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-meta-collect-'))
    const loopDir = writeLoopBundle(root, 'sparse', {
      review: '### Verdict\n**PASS**',
    })
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const bundle = collectLoopArtifacts(loopDir, {
      repoRoot: root,
      profile: repoProfileSchema.parse({}),
    })

    expect(bundle.review?.content).toContain('PASS')
    expect(bundle.missing).toContain('log.ndjson')
    expect(bundle.missing).toContain('failure-domains.ndjson')
    expect(bundle.diffStat).toContain('src/example.ts')
    stderrSpy.mockRestore()
  })

  it('runs meta-review with mocked judge and writes report', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-meta-run-'))
    const loopDir = writeLoopBundle(root, 'done', {
      review: '### Verdict\n**PASS**',
      log: '{"iteration":1,"complete":true}\n',
      failureDomains: '{"reason":"review_gate"}\n',
    })
    const outDir = path.join(root, 'reports')
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await runMetaReview({
      inputPaths: [loopDir],
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({ taskwarriorProject: 'loops' }) },
      outDir,
      reviewModel: 'grok-4.5',
    })

    expect(runCursorAgentPrompt).toHaveBeenCalledOnce()
    expect(fs.existsSync(result.outPath)).toBe(true)
    expect(result.outPath).toBe(resolveMetaReviewOutputPath({ outDir }))
    expect(result.text).toContain('### Cross-loop themes')
    expect(result.parsed.verdict).toBe('ADVISORY')
    expect(result.loops).toHaveLength(1)
    expect(stderrSpy.mock.calls.some((c) => String(c[0]).includes('included loops'))).toBe(true)
    stderrSpy.mockRestore()
  })

  it('creates HITL tasks when --hitl is enabled', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-meta-hitl-'))
    const loopDir = writeLoopBundle(root, 'done', { review: '### Verdict\n**PASS**' })

    const result = await runMetaReview({
      inputPaths: [loopDir],
      ctx: { repoRoot: root, profile: repoProfileSchema.parse({ taskwarriorProject: 'loops' }) },
      outDir: root,
      hitl: true,
    })

    expect(createHitlCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Manual cross-loop QA',
        reason: 'post_success',
      }),
    )
    expect(result.hitlTaskUuids).toEqual(['hitl-uuid-1'])
  })

  it('parses HITL bullets and task add lines', async () => {
    const text = `### HITL follow-ups
- task add project:dxp -- 'Check migration drift'
- plain follow-up`

    expect(extractHitlFollowUpBullets(text)).toEqual([
      "task add project:dxp -- 'Check migration drift'",
      'plain follow-up',
    ])
    expect(parseTaskAddDescription("task add project:dxp -- 'Check migration drift'")).toEqual({
      project: 'dxp',
      description: 'Check migration drift',
    })

    createHitlCheckpoint.mockResolvedValueOnce('uuid-a').mockResolvedValueOnce('uuid-b')
    const ctx = { repoRoot: process.cwd(), profile: repoProfileSchema.parse({ taskwarriorProject: 'loops' }) }
    const uuids = await createHitlTasksFromFollowUps(
      extractHitlFollowUpBullets(text),
      ctx,
      { taskwarriorProject: 'loops' },
    )
    expect(uuids).toEqual(['uuid-a', 'uuid-b'])
  })
})

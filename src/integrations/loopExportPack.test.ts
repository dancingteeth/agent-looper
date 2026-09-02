import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  EXPORT_META_FILENAME,
  EXPORT_REVIEW_FILENAME,
  LOOP_EXPORTS_DIRNAME,
  loopExportSlug,
  readLoopExportPackArtifacts,
  resolveExistingExportPackRels,
  writeLoopExportPack,
} from './loopExportPack.js'

describe('loopExportPack', () => {
  it('slugs loop relative paths', () => {
    expect(loopExportSlug('.cursor/loops/mcp-server')).toBe('mcp-server')
    expect(loopExportSlug('.cursor/loops/batch/item-a')).toBe('batch__item-a')
    expect(loopExportSlug('../../../../var/folders/dd/x/T/agent-loop-run-02kDx0')).toBe(
      'outside-var__folders__dd__x__T__agent-loop-run-02kDx0',
    )
  })

  it('does not write an export pack when the loop dir is outside the repo', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-export-repo-'))
    const loopDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-run-'))
    const result = writeLoopExportPack({
      repoRoot: repo,
      loopDir,
      result: {
        complete: true,
        status: 'done',
        completionReason: 'Verifier passed',
        iterations: 1,
      },
    })
    expect(result.skipped).toBe('outside-repo')
    expect(result.files).toEqual([])
    expect(fs.existsSync(path.join(repo, LOOP_EXPORTS_DIRNAME))).toBe(false)
    fs.rmSync(repo, { recursive: true, force: true })
    fs.rmSync(loopDir, { recursive: true, force: true })
  })

  it('writes curated pack and reads it back when in-loop files are gone', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-export-'))
    const loopDir = path.join(root, '.cursor', 'loops', 'demo')
    fs.mkdirSync(loopDir, { recursive: true })
    fs.writeFileSync(path.join(loopDir, 'run-report.md'), '# report\n')
    fs.writeFileSync(path.join(loopDir, 'review.md'), '### Verdict\n**PASS**\n')
    fs.writeFileSync(path.join(loopDir, 'log.ndjson'), '{"iteration":1}\n{"iteration":2}\n')

    const result = writeLoopExportPack({
      repoRoot: root,
      loopDir,
      result: {
        complete: true,
        status: 'done',
        completionReason: 'Verifier passed',
        iterations: 2,
      },
    })

    expect(result.exportDir).toContain(path.join(LOOP_EXPORTS_DIRNAME, 'demo'))
    expect(fs.existsSync(path.join(result.exportDir, EXPORT_META_FILENAME))).toBe(true)
    expect(fs.existsSync(path.join(result.exportDir, EXPORT_REVIEW_FILENAME))).toBe(true)

    // Simulate cloud clone: wipe in-loop artifacts
    fs.rmSync(path.join(loopDir, 'review.md'))
    fs.rmSync(path.join(loopDir, 'log.ndjson'))
    fs.rmSync(path.join(loopDir, 'run-report.md'))

    const packed = readLoopExportPackArtifacts({ repoRoot: root, loopDir })
    expect(packed.review?.content).toContain('PASS')
    expect(packed.logNdjson).toContain('"iteration":2')
    expect(packed.meta?.complete).toBe(true)
    expect(packed.runReport).toContain('# report')
  })

  it('lists existing export packs for batch notify aggregation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-export-list-'))
    const a = path.join(root, '.cursor', 'loops', 'a')
    const b = path.join(root, '.cursor', 'loops', 'b')
    const missing = path.join(root, '.cursor', 'loops', 'missing')
    fs.mkdirSync(a, { recursive: true })
    fs.mkdirSync(b, { recursive: true })
    writeLoopExportPack({
      repoRoot: root,
      loopDir: a,
      result: {
        complete: true,
        status: 'done',
        completionReason: 'ok',
        iterations: 1,
      },
    })
    writeLoopExportPack({
      repoRoot: root,
      loopDir: b,
      result: {
        complete: false,
        status: 'continue',
        completionReason: 'verify',
        iterations: 2,
      },
    })

    const packs = resolveExistingExportPackRels(root, [a, b, missing])
    expect(packs).toEqual([
      path.join(LOOP_EXPORTS_DIRNAME, 'a'),
      path.join(LOOP_EXPORTS_DIRNAME, 'b'),
    ])
  })
})

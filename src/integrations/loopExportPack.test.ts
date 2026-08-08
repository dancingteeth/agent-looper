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
  writeLoopExportPack,
} from './loopExportPack.js'

describe('loopExportPack', () => {
  it('slugs loop relative paths', () => {
    expect(loopExportSlug('.cursor/loops/mcp-server')).toBe('mcp-server')
    expect(loopExportSlug('.cursor/loops/batch/item-a')).toBe('batch__item-a')
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
})

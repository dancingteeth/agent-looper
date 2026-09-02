import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureLoopGitignoreBlock, LOOP_GITIGNORE_MARKER } from './initGitignore.js'

function tmpRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-init-'))
}

describe('ensureLoopGitignoreBlock', () => {
  it('creates .gitignore with the loop artifact block when missing', () => {
    const root = tmpRepo()
    expect(ensureLoopGitignoreBlock(root)).toBe('written')
    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(content).toContain(LOOP_GITIGNORE_MARKER)
    expect(content).toContain('.cursor/loops/**/run-report.md')
    expect(content).toContain('.cursor/loops/**/transcript.ndjson')
    expect(content).toContain('.cursor/loops/**/assistant.stream')
    expect(content).toContain('.cursor/loops/**/prompt-run.log')
    expect(content).toContain('.cursor/loops/**/verify-logs/')
    expect(content).toContain('.cursor/loops/**/log.ndjson')
    expect(content).toContain('.cursor/loops/**/watch-status.json')
    expect(content).toContain('.cursor/sdk-runs/')
  })

  it('appends to an existing .gitignore without clobbering it', () => {
    const root = tmpRepo()
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/')
    expect(ensureLoopGitignoreBlock(root)).toBe('written')
    const content = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(content.startsWith('node_modules/')).toBe(true)
    expect(content).toContain(LOOP_GITIGNORE_MARKER)
  })

  it('is idempotent — skips when the block is already present', () => {
    const root = tmpRepo()
    expect(ensureLoopGitignoreBlock(root)).toBe('written')
    const before = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(ensureLoopGitignoreBlock(root)).toBe('skipped')
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toBe(before)
  })
})

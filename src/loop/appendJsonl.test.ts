import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendJsonlLine } from './appendJsonl.js'

describe('appendJsonlLine', () => {
  const files: string[] = []

  afterEach(() => {
    for (const file of files) {
      fs.rmSync(file, { force: true })
    }
    files.length = 0
    vi.restoreAllMocks()
  })

  it('appends a JSON line', () => {
    const filePath = path.join(os.tmpdir(), `agent-loop-jsonl-${Date.now()}.ndjson`)
    files.push(filePath)
    appendJsonlLine(filePath, { iteration: 1 })
    expect(fs.readFileSync(filePath, 'utf8')).toBe(`${JSON.stringify({ iteration: 1 })}\n`)
  })

  it('logs and continues when JSON.stringify throws', () => {
    const filePath = path.join(os.tmpdir(), `agent-loop-jsonl-cycle-${Date.now()}.ndjson`)
    files.push(filePath)
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => appendJsonlLine(filePath, cyclic)).not.toThrow()
    expect(fs.existsSync(filePath)).toBe(false)
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('failed to serialize log line'))).toBe(
      true,
    )
  })

  it('logs and continues when appendFileSync throws', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => appendJsonlLine('/no-such-dir/loop.ndjson', { ok: true })).not.toThrow()
    expect(stderr.mock.calls.some((c) => String(c[0]).includes('failed to append log'))).toBe(true)
  })
})

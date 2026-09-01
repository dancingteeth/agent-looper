import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cliDir = path.dirname(fileURLToPath(import.meta.url))

function readCli(name: string): string {
  return fs.readFileSync(path.join(cliDir, name), 'utf8')
}

describe('CLI SIGINT isolation', () => {
  it('does not install process-tree SIGINT handlers at CLI load (watch owns Ctrl-C)', () => {
    expect(readCli('run.ts')).not.toContain('installSpawnedProcessSignalHandlers')
    expect(readCli('run-batch.ts')).not.toContain('installSpawnedProcessSignalHandlers')
    expect(readCli('review-run.ts')).not.toContain('installSpawnedProcessSignalHandlers')
    expect(readCli('meta-review.ts')).not.toContain('installSpawnedProcessSignalHandlers')
    expect(readCli('watch.ts')).toContain("process.once('SIGINT'")
  })
})

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const MARKER_LINE = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/

function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: packageRoot, encoding: 'utf8' })
  return out.split('\0').filter(Boolean)
}

function scanFile(absPath) {
  const text = readFileSync(absPath, 'utf8')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (MARKER_LINE.test(lines[i])) {
      const rel = absPath.slice(packageRoot.length + 1)
      return `${rel}:${i + 1}`
    }
  }
  return null
}

describe('no git merge conflict markers in tracked files', () => {
  it('git ls-files has no <<<<<<< / ======= / >>>>>>> lines', () => {
    const hits = []
    for (const rel of listTrackedFiles()) {
      const abs = join(packageRoot, rel)
      try {
        if (statSync(abs).isDirectory()) continue
      } catch {
        continue
      }
      const hit = scanFile(abs)
      if (hit) hits.push(hit)
    }
    assert.deepEqual(hits, [])
  })
})

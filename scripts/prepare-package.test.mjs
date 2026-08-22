import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'
import {
  missingRequired,
  newestSourceMtimeMs,
  oldestDistMtimeMs,
  srcIsNewerThanDist,
} from './prepare-package.mjs'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

const OLD = new Date('2026-01-01T00:00:00.000Z')
const NEW = new Date('2026-06-01T00:00:00.000Z')

function touch(filePath, mtime) {
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, '// fixture\n')
  utimesSync(filePath, mtime, mtime)
}

/** Fixture package root with every manifest-required dist file + a src/ tree. */
function makeFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'agent-loop-prepare-'))
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'scripts/dist-manifest.json'), 'utf8'),
  )
  for (const rel of manifest.required) {
    if (rel.startsWith('dist/')) touch(join(root, rel), OLD)
  }
  touch(join(root, 'src', 'index.ts'), OLD)
  return root
}

describe('prepare-package.mjs', () => {
  it('parses as valid ESM on Node 22+', () => {
    const result = spawnSync(process.execPath, ['--check', 'scripts/prepare-package.mjs'], {
      cwd: packageRoot,
      encoding: 'utf8',
    })
    assert.equal(
      result.status,
      0,
      `prepare-package.mjs syntax check failed:\n${result.stderr ?? result.stdout}`,
    )
  })

  it('treats dist as fresh when all sources are older', () => {
    const root = makeFixtureRoot()
    try {
      assert.equal(srcIsNewerThanDist(root), false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects content edits in previously unwatched dirs (src/agents, src/review, src/usage)', () => {
    const root = makeFixtureRoot()
    try {
      const edited = [
        'src/agents/cursorAgent.ts',
        'src/review/reviewVerdict.ts',
        'src/stream/streamCollect.ts',
        'src/usage/loopUsage.ts',
      ]
      for (const rel of edited) {
        touch(join(root, rel), NEW)
        assert.equal(srcIsNewerThanDist(root), true, `expected stale after editing ${rel}`)
        touch(join(root, rel), OLD)
        assert.equal(srcIsNewerThanDist(root), false, `expected fresh again for ${rel}`)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores test files — they are not compiled into dist/', () => {
    const root = makeFixtureRoot()
    try {
      touch(join(root, 'src', 'loop', 'agentLoop.test.ts'), NEW)
      assert.equal(srcIsNewerThanDist(root), false)
      touch(join(root, 'src', 'cli', 'setupTui.test.tsx'), NEW)
      assert.equal(srcIsNewerThanDist(root), false)
      assert.equal(newestSourceMtimeMs(root), OLD.getTime())
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects tsx source edits (Ink wizard)', () => {
    const root = makeFixtureRoot()
    try {
      touch(join(root, 'src', 'cli', 'setupTui.tsx'), NEW)
      assert.equal(srcIsNewerThanDist(root), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports missing dist files and forces a rebuild', () => {
    const root = makeFixtureRoot()
    try {
      rmSync(join(root, 'dist', 'cli', 'run.js'))
      assert.ok(missingRequired(root).includes('dist/cli/run.js'))
      assert.equal(oldestDistMtimeMs(root), 0)
      assert.equal(srcIsNewerThanDist(root), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

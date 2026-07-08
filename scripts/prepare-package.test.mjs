import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

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
})

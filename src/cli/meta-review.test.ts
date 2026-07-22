import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

const packageRoot = path.resolve(import.meta.dirname, '../..')
const cliPath = path.join(packageRoot, 'dist/cli/meta-review.js')

function ensureCliBuilt(): void {
  if (existsSync(cliPath)) return
  const build = spawnSync('pnpm', ['run', 'build'], {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (build.status !== 0) {
    throw new Error(
      `pnpm build failed (status ${build.status}): ${build.stderr || build.stdout}`,
    )
  }
  if (!existsSync(cliPath)) {
    throw new Error(`build succeeded but missing ${cliPath}`)
  }
}

describe('agent-loop-meta-review CLI', () => {
  beforeAll(() => {
    ensureCliBuilt()
  })
  it('prints help and exits 0', () => {
    const result = spawnSync(process.execPath, [cliPath, '--help'], {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('agent-loop-meta-review')
    expect(result.stdout).toContain('--hitl')
    expect(result.stdout).toContain('--out-dir')
  }, 20_000)

  it('requires at least one path', () => {
    const result = spawnSync(process.execPath, [cliPath], {
      cwd: packageRoot,
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(result.status).toBe(1)
    expect(result.stderr + result.stdout).toMatch(/At least one loop path|Usage:/)
  }, 20_000)
})

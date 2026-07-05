#!/usr/bin/env node
/**
 * Lifecycle prepare: ensure dist/ is complete before consumers import CLIs.
 * Skips when dist is already complete; builds when tsc is available.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'scripts/dist-manifest.json'), 'utf8'),
) as { required: string[] }

function missingRequired(baseDir) {
  return manifest.required.filter((rel) => !existsSync(join(baseDir, rel)))
}

function srcIsNewerThanDist() {
  const distIndex = join(packageRoot, 'dist/index.js')
  if (!existsSync(distIndex)) return true
  const distMtime = statSync(distIndex).mtimeMs
  const srcRoots = ['src/index.ts', 'src/cli', 'src/loop', 'src/context', 'src/integrations']
  for (const rel of srcRoots) {
    const full = join(packageRoot, rel)
    if (!existsSync(full)) continue
    if (statSync(full).mtimeMs > distMtime) return true
  }
  return false
}

const missing = missingRequired(packageRoot)
if (missing.length === 0 && !srcIsNewerThanDist()) {
  process.exit(0)
}

const build = spawnSync('pnpm', ['run', 'build'], {
  cwd: packageRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (build.status !== 0) {
  const stillMissing = missingRequired(packageRoot)
  if (stillMissing.length > 0) {
    console.error('\n[@dancingteeth/agent-loop] dist/ is incomplete and build failed.')
    console.error('Missing:', stillMissing.join(', '))
    console.error(
      '\nFix (from your machine):\n' +
        `  cd ${packageRoot} && pnpm install && pnpm build\n` +
        'Then re-run pnpm install in the consumer repo.\n' +
        'Or run: pnpm exec agent-loop-doctor\n',
    )
    process.exit(1)
  }
  process.exit(build.status ?? 1)
}

const afterBuild = missingRequired(packageRoot)
if (afterBuild.length > 0) {
  console.error('\n[@dancingteeth/agent-loop] build finished but dist/ is still incomplete.')
  console.error('Missing:', afterBuild.join(', '))
  process.exit(1)
}

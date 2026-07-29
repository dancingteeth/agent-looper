#!/usr/bin/env node
/**
 * Lifecycle prepare: ensure dist/ is complete before consumers import CLIs.
 * Skips when dist is already complete; builds when tsc is available.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'scripts/dist-manifest.json'), 'utf8'),
)
/** @type {string[]} */
const required = manifest.required

/** @param {string} baseDir @returns {string[]} */
export function missingRequired(baseDir) {
  return required.filter((rel) => !existsSync(join(baseDir, rel)))
}

/**
 * Newest mtime (ms) across compiled sources under src/, walked recursively.
 *
 * Directory mtimes are NOT usable here: on POSIX/macOS, editing an existing
 * file's contents does not update its parent directory mtime, so a dir-level
 * check silently misses content edits (the stale-dist bug this fixes).
 * Test files are excluded — they are typechecked but never emitted to dist/.
 *
 * @param {string} root package root containing src/
 * @returns {number} newest source mtime in ms, or 0 when src/ is absent
 */
export function newestSourceMtimeMs(root) {
  const srcRoot = join(root, 'src')
  if (!existsSync(srcRoot)) return 0
  const walk = (dir) => {
    let newest = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        const child = walk(full)
        if (child > newest) newest = child
      } else if (
        entry.isFile() &&
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts')
      ) {
        const mtime = statSync(full).mtimeMs
        if (mtime > newest) newest = mtime
      }
    }
    return newest
  }
  return walk(srcRoot)
}

/**
 * Oldest mtime (ms) across the manifest's dist/ files; 0 when any is missing.
 * @param {string} root
 * @returns {number}
 */
export function oldestDistMtimeMs(root) {
  let oldest = Infinity
  for (const rel of required) {
    if (!rel.startsWith('dist/')) continue
    const full = join(root, rel)
    if (!existsSync(full)) return 0
    const mtime = statSync(full).mtimeMs
    if (mtime < oldest) oldest = mtime
  }
  return oldest === Infinity ? 0 : oldest
}

/**
 * True when any compiled source is newer than the oldest required dist file —
 * i.e. dist/ no longer reflects src/. The previous implementation compared a
 * hardcoded subset of src roots by *directory* mtime, which missed every
 * content-only edit and all of src/agents, src/review, src/stream, src/usage.
 * @param {string} [root]
 * @returns {boolean}
 */
export function srcIsNewerThanDist(root = packageRoot) {
  if (!existsSync(join(root, 'dist', 'index.js'))) return true
  const newestSrc = newestSourceMtimeMs(root)
  if (newestSrc === 0) return false
  return newestSrc > oldestDistMtimeMs(root)
}

function main() {
  const missing = missingRequired(packageRoot)
  if (missing.length === 0 && !srcIsNewerThanDist(packageRoot)) {
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
}

// Run main only when executed directly (not when imported by tests). Compare
// realpaths so pnpm's symlinked file: installs still count as direct.
const invokedDirectly = (() => {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return realpathSync(resolve(entry)) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (invokedDirectly) {
  main()
}

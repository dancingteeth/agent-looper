import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, cwd, env = process.env) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return result
}

function npmPack(root) {
  const out = execFileSync('npm', ['pack', '--pack-destination', root], {
    cwd: packageRoot,
    encoding: 'utf8',
  }).trim()
  const tarball = out.split('\n').pop()
  assert.ok(tarball?.endsWith('.tgz'), `unexpected npm pack output: ${out}`)
  return join(root, tarball)
}

function installTarball(projectDir, tarball) {
  const install = run('npm', ['install', '--no-save', tarball], projectDir)
  assert.equal(install.status, 0, install.stderr || install.stdout)
}

function agentLoopCli(projectDir, bin, args) {
  const cli = join(
    projectDir,
    'node_modules',
    '@dancingteeth',
    'agent-looper',
    'dist',
    'cli',
    `${bin}.js`,
  )
  return run('node', [cli, ...args], projectDir)
}

describe('clean install from npm pack (no optional peers)', () => {
  it('agent-loop --version and --help work without any runtime SDK', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'agent-looper-pack-'))
    try {
      execFileSync('pnpm', ['build'], { cwd: packageRoot, stdio: 'inherit' })
      const tarball = npmPack(scratch)
      const projectDir = mkdtempSync(join(scratch, 'proj-'))
      run('npm', ['init', '-y'], projectDir)
      installTarball(projectDir, tarball)

      const version = agentLoopCli(projectDir, 'run', ['--version'])
      assert.equal(version.status, 0, version.stderr)
      const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
      assert.equal(version.stdout.trim(), pkg.version)

      const help = agentLoopCli(projectDir, 'run', ['--help'])
      assert.equal(help.status, 0, help.stderr)
      assert.match(help.stdout, /--version/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('selecting a missing runtime surfaces a friendly install hint', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'agent-looper-pack-'))
    try {
      execFileSync('pnpm', ['build'], { cwd: packageRoot, stdio: 'inherit' })
      const tarball = npmPack(scratch)
      const projectDir = mkdtempSync(join(scratch, 'proj-'))
      run('npm', ['init', '-y'], projectDir)
      installTarball(projectDir, tarball)

      const check = agentLoopCli(projectDir, 'check', ['cursor'])
      assert.notEqual(check.status, 0)
      const combined = `${check.stderr}\n${check.stdout}`
      assert.match(combined, /Runtime "cursor" needs @cursor\/sdk/)
      assert.doesNotMatch(combined, /ERR_MODULE_NOT_FOUND/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('opencode-only install gets past CLI startup without @cursor/sdk', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'agent-looper-pack-'))
    try {
      execFileSync('pnpm', ['build'], { cwd: packageRoot, stdio: 'inherit' })
      const tarball = npmPack(scratch)
      const projectDir = mkdtempSync(join(scratch, 'proj-'))
      run('npm', ['init', '-y'], projectDir)
      const peers = run(
        'npm',
        [
          'install',
          '--no-save',
          tarball,
          '@opencode-ai/sdk@^1.18.15',
          'opencode-ai@^1.18.15',
        ],
        projectDir,
      )
      assert.equal(peers.status, 0, peers.stderr || peers.stdout)

      const version = agentLoopCli(projectDir, 'run', ['--version'])
      assert.equal(version.status, 0, version.stderr)

      const check = agentLoopCli(projectDir, 'check', ['opencode'])
      const combined = `${check.stderr}\n${check.stdout}`
      assert.doesNotMatch(combined, /Cannot find package '@cursor\/sdk'/)
      assert.doesNotMatch(combined, /ERR_MODULE_NOT_FOUND.*@cursor\/sdk/)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

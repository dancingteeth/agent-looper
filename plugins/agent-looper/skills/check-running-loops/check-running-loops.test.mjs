import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const skillDir = dirname(fileURLToPath(import.meta.url))
const script = join(skillDir, 'scripts/check-running-loops.sh')

function run(repo, env = {}) {
  const merged = { ...process.env, ...env }
  if (Object.prototype.hasOwnProperty.call(env, 'CURSOR_TERMINALS_DIR') && !env.CURSOR_TERMINALS_DIR) {
    delete merged.CURSOR_TERMINALS_DIR
  }
  const result = spawnSync('sh', [script, repo], {
    encoding: 'utf8',
    env: merged,
  })
  const detail = `status=${result.status}\n${result.stderr}\n${result.stdout}`
  assert.equal(result.status, 0, detail)
  return result.stdout
}

function writeTerminal(dir, name, body) {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, name)
  writeFileSync(path, body)
  return path
}

describe('check-running-loops.sh', () => {
  it('reports NONE terminals and loops in an empty repo', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-empty-'))
    const terms = join(root, 'terminals')
    mkdirSync(terms)
    try {
      const out = run(root, { CURSOR_TERMINALS_DIR: terms })
      assert.match(out, /NONE matching agent-loop/)
      assert.match(out, /NONE .*loops/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('classifies a dead pid with AGENT_LOOP_DONE as DONE', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-done-'))
    const terms = join(root, 'terminals')
    writeTerminal(
      terms,
      '9.txt',
      [
        '---',
        'pid: 999999999',
        'cwd: /tmp',
        'last_command: pnpm exec agent-loop run .cursor/loops/demo',
        'last_exit_code: 0',
        '---',
        '[agent-loop] iteration 2 verify: exit 0',
        'AGENT_LOOP_DONE {"v":1,"complete":true}',
        '',
      ].join('\n'),
    )
    try {
      const out = run(root, { CURSOR_TERMINALS_DIR: terms, STALE_SECS: '180', HUNG_SECS: '600' })
      assert.match(out, /file=9\.txt verdict=DONE pid=999999999 ps=DEAD/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('classifies a live pid with a stale terminal log as ALIVE_BUT_STALE', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-stale-'))
    const terms = join(root, 'terminals')
    const file = writeTerminal(
      terms,
      '3.txt',
      [
        '---',
        `pid: ${process.pid}`,
        'status: running',
        'command: pnpm exec agent-loop run .cursor/loops/demo --runtime cursor',
        '---',
        '[agent-loop] iteration 1',
        '',
      ].join('\n'),
    )
    const stale = new Date(Date.now() - 400_000)
    utimesSync(file, stale, stale)
    try {
      const out = run(root, { CURSOR_TERMINALS_DIR: terms, STALE_SECS: '180', HUNG_SECS: '600' })
      assert.match(out, new RegExp(`file=3\\.txt verdict=ALIVE_BUT_STALE pid=${process.pid} ps=ALIVE`))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('prefers watch-status.json over log.ndjson and reports run pid liveness', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-watch-'))
    const terms = join(root, 'terminals')
    mkdirSync(terms)
    const loopDir = join(root, '.cursor/loops/demo')
    mkdirSync(loopDir, { recursive: true })
    writeFileSync(join(loopDir, 'log.ndjson'), '{"iteration":1}\n')
    const old = new Date(Date.now() - 3_600_000)
    utimesSync(join(loopDir, 'log.ndjson'), old, old)
    writeFileSync(
      join(loopDir, 'loop.json'),
      `${JSON.stringify({ verify: 'verify.sh', runtime: 'opencode' })}\n`,
    )
    writeFileSync(
      join(loopDir, 'watch-status.json'),
      `${JSON.stringify({
        phase: 'WORKER',
        iteration: 2,
        maxIterations: 8,
        costUsd: 0.1,
        phaseStartedAt: new Date().toISOString(),
        pid: process.pid,
      })}\n`,
    )
    try {
      const out = run(root, { CURSOR_TERMINALS_DIR: terms })
      assert.match(
        out,
        new RegExp(
          `loop=demo source=watch-status.json .*runtime=opencode phase=WORKER iteration=2/8 pid=${process.pid} ps=ALIVE`,
        ),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to log.ndjson when watch-status.json is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-log-'))
    const terms = join(root, 'terminals')
    mkdirSync(terms)
    const loopDir = join(root, '.cursor/loops/solo')
    mkdirSync(loopDir, { recursive: true })
    writeFileSync(join(loopDir, 'log.ndjson'), '{"iteration":1}\n')
    try {
      const out = run(root, { CURSOR_TERMINALS_DIR: terms })
      assert.match(out, /loop=solo source=log\.ndjson .*runtime=defaults/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('finds a grind whose TTY lives under a sibling Cursor project', () => {
    const root = mkdtempSync(join(tmpdir(), 'check-loops-sib-'))
    const projects = join(root, 'cursor-projects')
    const harnessTerms = join(projects, 'Users-me-Projects-agent-loop', 'terminals')
    writeTerminal(
      harnessTerms,
      '7.txt',
      [
        '---',
        'pid: 999999998',
        `cwd: ${root}`,
        'status: succeeded',
        'command: doppler run --project agent-looper --config dev -- pnpm loop:run .cursor/loops/museum2',
        '---',
        'AGENT_LOOP_DONE {"v":1,"complete":true}',
        '',
      ].join('\n'),
    )
    try {
      const out = run(root, {
        CURSOR_PROJECTS_DIR: projects,
        CURSOR_TERMINALS_DIR: '',
        HOME: join(root, 'empty-home'),
      })
      assert.match(out, /sibling terminal files/)
      assert.match(out, /file=7\.txt verdict=DONE pid=999999998 ps=DEAD/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

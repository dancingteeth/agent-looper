import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseLoopBatchConfig } from '../loop/loopBatch.js'
import { resolveBatchLoopDir } from '../loop/loopBatchPaths.js'
import { loadLoopBundle } from '../loop/loopConfig.js'
import { validateGoalPreflight } from '../loop/loopPreflight.js'
import { lintVerifyScript } from '../loop/verifyScriptLint.js'
import { buildImproveBundle, orderPlansForBatch, shq } from './improveBundle.js'
import { importImprovePlans } from './improveImport.js'
import { extractChecks, looksLikeCommand, parseImprovePlan, parsePlanIndex } from './improvePlan.js'

/** A plan in the shadcn/improve plan-template shape, small enough to run in a throwaway repo. */
function improvePlanFixture(opts: { sha?: string; number?: string; dependsOn?: string } = {}): string {
  const sha = opts.sha ?? '1994caba0'
  const number = opts.number ?? '001'
  return `# Plan ${number}: Extract the shared greeting helper

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in \`plans/README.md\`.
>
> **Drift check (run first)**: \`git diff --stat ${sha}..HEAD -- src/a.js src/b.js src/shared.js\`
> If any of these changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: ${opts.dependsOn ?? 'none'}
- **Category**: tech-debt
- **Planned at**: commit \`${sha}\`, 2026-11-20

## Why this matters

\`a.js\` and \`b.js\` each build the same greeting by hand
(\`a.js:1\`: "TODO: duplicate greeting"). The copies will drift.

## Current state

- \`src/a.js\` — duplicate greeting:

\`\`\`js
# not a heading — inside a fence
// TODO: duplicate greeting
\`\`\`

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | \`npm install\`          | exit 0              |
| Tests     | \`node --test test/\`    | all pass            |

## Scope

**In scope** (the only files you should modify):
- \`src/a.js\`
- \`src/b.js\`
- \`src/shared.js\` (create)

**Out of scope** (do NOT touch, even though they look related):
- \`src/legacy.js\` — deprecated path.

## Steps

### Step 1: Add \`src/shared.js\`

Export \`greet(name)\`.

**Verify**: \`test -f src/shared.js\` → exit 0

### Step 2: Switch callers

**Verify**: \`grep -rn "TODO: duplicate greeting" src/\` → no matches

## Done criteria

- [ ] \`test -f src/shared.js\` exits 0
- [ ] \`grep -rn "TODO: duplicate greeting" src/\` returns no matches
- [ ] \`pnpm test -- <filter>\` passes
- [ ] Both \`a.js\` and \`b.js\` call \`greet\`; neither builds the string inline
- [ ] No files outside the in-scope list are modified (\`git status\`)
- [ ] \`plans/README.md\` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations above doesn't match the excerpts.
- The fix appears to require touching \`src/legacy.js\`.

## Maintenance notes

- Future callers should import \`greet\`.
- Reviewer focus: confirm the greeting text is byte-identical.
`
}

const improveIndexFixture = `# Implementation Plans

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Extract helper | P2 | S | — | TODO |
| 002  | Docs | P3 | S | 001 | IN PROGRESS |
| 003  | Old | P3 | S | — | DONE |
| 004  | Stuck | P3 | S | — | BLOCKED (needs API key) |
| 005  | After stuck | P3 | S | 004 | TODO |
`

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-improve-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git('init', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  fs.mkdirSync(path.join(dir, 'src'))
  fs.writeFileSync(path.join(dir, 'src/a.js'), '// TODO: duplicate greeting\nexport const a = "hi " + name\n')
  fs.writeFileSync(path.join(dir, 'src/b.js'), 'export const b = "hi " + name\n')
  fs.writeFileSync(path.join(dir, 'src/legacy.js'), 'export {}\n')
  git('add', '.')
  git('commit', '-m', 'init')
  return dir
}

function head(dir: string): string {
  return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
}

function sh(dir: string, script: string): { status: number | null; out: string } {
  const r = spawnSync('bash', [script], { cwd: dir, encoding: 'utf8' })
  return { status: r.status, out: `${r.stdout}${r.stderr}` }
}

const tmpDirs: string[] = []
afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

describe('parseImprovePlan', () => {
  const plan = parseImprovePlan(improvePlanFixture(), '001-extract-shared-helper.md')

  it('reads title, status fields and provenance', () => {
    expect(plan).toMatchObject({
      number: '001',
      slug: 'extract-shared-helper',
      title: 'Extract the shared greeting helper',
      priority: 'P2',
      effort: 'S',
      risk: 'MED',
      category: 'tech-debt',
      dependsOn: [],
      plannedAtSha: '1994caba0',
      plannedAtDate: '2026-11-20',
      installCommand: 'npm install',
    })
    expect(plan.driftPaths).toEqual(['src/a.js', 'src/b.js', 'src/shared.js'])
  })

  it('reads scope lists and stop conditions', () => {
    expect(plan.inScope).toEqual(['src/a.js', 'src/b.js', 'src/shared.js'])
    expect(plan.outOfScope).toEqual(['`src/legacy.js` — deprecated path.'])
    expect(plan.stopConditions).toHaveLength(2)
    expect(plan.reviewerFocus).toEqual(['Reviewer focus: confirm the greeting text is byte-identical.'])
  })

  it('classifies done criteria', () => {
    const [exists, grep, placeholder, judge, scope, index] = plan.criteria
    expect(exists.checks).toEqual([
      expect.objectContaining({ command: 'test -f src/shared.js', expect: 'zero', inferred: false }),
    ])
    expect(grep.checks).toEqual([
      expect.objectContaining({ command: 'grep -rn "TODO: duplicate greeting" src/', expect: 'empty' }),
    ])
    expect(placeholder.checks).toEqual([])
    expect(judge.checks).toEqual([])
    expect(scope).toMatchObject({ scopeCheck: true, checks: [] })
    expect(index).toMatchObject({ indexBookkeeping: true, checks: [] })
    expect(plan.warnings.join('\n')).toMatch(/placeholder command `pnpm test -- <filter>`/)
    expect(plan.stepChecks.map((c) => c.expect)).toEqual(['zero', 'empty'])
  })

  it('drops the executor blockquote and keeps fenced # lines out of the headings', () => {
    expect(plan.body).not.toMatch(/Executor instructions/)
    expect(plan.body).toMatch(/# not a heading — inside a fence/)
    expect(plan.why).toMatch(/copies will drift/)
  })

  it('reads dependencies and rejects non-plans', () => {
    expect(parseImprovePlan(improvePlanFixture({ number: '002', dependsOn: 'plans/001-*.md' })).dependsOn).toEqual(['001'])
    expect(() => parseImprovePlan('# Notes\n\nhello')).toThrow(/Not an improve plan/)
  })
})

describe('extractChecks', () => {
  it('reads one expectation per command and skips symbols, unsafe and placeholder commands', () => {
    const warnings: string[] = []
    const checks = extractChecks(
      '`pnpm typecheck` exits 0 and `grep -rn foo src/` returns no matches; `resolveShadowConfig` exists; `git push origin` ok; `rm -rf dist` ok',
      warnings,
    )
    expect(checks.map((c) => [c.command, c.expect])).toEqual([
      ['pnpm typecheck', 'zero'],
      ['grep -rn foo src/', 'empty'],
    ])
    expect(warnings).toHaveLength(2)
  })

  it('marks unstated expectations as inferred', () => {
    expect(extractChecks('`pnpm lint`', [])[0]).toMatchObject({ expect: 'zero', inferred: true })
    expect(extractChecks('`./scripts/check.sh` exits non-zero', [])[0]).toMatchObject({ expect: 'nonzero' })
  })

  it('tells commands from paths and identifiers', () => {
    expect(looksLikeCommand('pnpm test')).toBe(true)
    expect(looksLikeCommand('./verify.sh')).toBe(true)
    expect(looksLikeCommand('src/a.ts')).toBe(false)
    expect(looksLikeCommand('a b')).toBe(false)
  })
})

describe('parsePlanIndex', () => {
  it('reads plan rows and normalizes status', () => {
    expect(parsePlanIndex(improveIndexFixture).map((r) => [r.number, r.status, r.dependsOn])).toEqual([
      ['001', 'TODO', []],
      ['002', 'IN PROGRESS', ['001']],
      ['003', 'DONE', []],
      ['004', 'BLOCKED', []],
      ['005', 'TODO', ['004']],
    ])
  })
})

describe('orderPlansForBatch', () => {
  const p = (number: string, dependsOn?: string) =>
    parseImprovePlan(improvePlanFixture({ number, dependsOn }), `${number}-x.md`)

  it('puts dependencies first and skips done, blocked and unreachable plans', () => {
    const index = parsePlanIndex(improveIndexFixture)
    const { ordered, skipped } = orderPlansForBatch([p('002', '001'), p('001'), p('003'), p('004'), p('005')], index)
    expect(ordered.map((x) => x.number)).toEqual(['001', '002'])
    expect(skipped.map((s) => s.number).sort()).toEqual(['003', '004', '005'])
  })

  it('accepts dependencies already DONE and reports cycles', () => {
    const index = parsePlanIndex(improveIndexFixture)
    expect(orderPlansForBatch([p('006', '003')], index).ordered.map((x) => x.number)).toEqual(['006'])
    const cyc = orderPlansForBatch([p('007', '008'), p('008', '007')], [])
    expect(cyc.ordered).toEqual([])
    expect(cyc.skipped.map((s) => s.reason)).toEqual(['dependency cycle', 'dependency cycle'])
  })
})

describe('buildImproveBundle', () => {
  const opts = { loopRel: '.cursor/loops/improve-001-x', planRel: 'plans/001-x.md' }

  it('maps the plan onto loop.json, GOAL.md and verify.sh', () => {
    const plan = parseImprovePlan(improvePlanFixture(), '001-x.md')
    const b = buildImproveBundle(plan, opts)
    expect(b.name).toBe('improve-001-x')
    expect(JSON.parse(b.files['loop.json'])).toEqual({
      verify: 'bash .cursor/loops/improve-001-x/verify.sh',
      setup: 'bash .cursor/loops/improve-001-x/setup.sh',
      maxIterations: 4,
      postQualityReview: true,
      reviewGate: true,
    })
    // The placeholder-only criterion still needs checking, so it goes to the judge.
    expect(b.judgeCriteria).toEqual([
      '`pnpm test -- <filter>` passes',
      'Both `a.js` and `b.js` call `greet`; neither builds the string inline',
    ])
    expect(validateGoalPreflight(b.files['GOAL.md'])).toMatchObject({ ok: true, warnings: [] })
    expect(b.files['GOAL.md']).toMatch(/### STOP conditions/)
    expect(b.files['GOAL.md']).toMatch(/^#### Step 1: Add `src\/shared.js`$/m)
    expect(b.files['verify.sh']).toMatch(/check empty 'grep -rn "TODO: duplicate greeting" src\/'/)
    expect(b.files['setup.sh']).toMatch(/^npm install$/m)
    expect(lintVerifyScript(b.files['verify.sh']).errors).toEqual([])
  })

  it('falls back to step Verify commands, and refuses plans with no runnable check', () => {
    const noDone = improvePlanFixture().replace(/## Done criteria[\s\S]*?## STOP/, '## STOP')
    const b = buildImproveBundle(parseImprovePlan(noDone, '001-x.md'), opts)
    expect(b.checksFrom).toBe('step-verify')
    expect(b.checks).toHaveLength(2)
    const none = noDone.replace(/\*\*Verify\*\*.*$/gm, '')
    expect(() => buildImproveBundle(parseImprovePlan(none, '001-x.md'), opts)).toThrow(/no runnable command/)
  })

  it('quotes commands containing single quotes', () => {
    expect(shq("grep -n 'a b' x")).toBe(`'grep -n '\\''a b'\\'' x'`)
  })
})

// Spawns git + bash many times; the 5s default is too tight when the whole suite runs in parallel.
const E2E_TIMEOUT_MS = 30_000

describe('importImprovePlans (end to end)', () => {
  it('writes a loop whose setup.sh and verify.sh enforce the plan', () => {
    const repo = initRepo()
    tmpDirs.push(repo)
    const sha = head(repo)
    fs.mkdirSync(path.join(repo, 'plans'))
    // Install is not runnable offline in a test; drop it from the commands table.
    fs.writeFileSync(
      path.join(repo, 'plans/001-extract-shared-helper.md'),
      improvePlanFixture({ sha }).replace(/\| Install .*\n/, ''),
    )
    fs.writeFileSync(path.join(repo, 'scratch.txt'), 'pre-existing dirt\n')

    const result = importImprovePlans({ source: 'plans/001-extract-shared-helper.md', repoRoot: repo })
    const loopRel = '.cursor/loops/improve-001-extract-shared-helper'
    expect(result.written).toEqual(['GOAL.md', 'verify.sh', 'setup.sh', 'loop.json'].map((f) => `${loopRel}/${f}`))
    expect(result.batchDir).toBeUndefined()
    const setup = `${loopRel}/setup.sh`
    const verify = `${loopRel}/verify.sh`

    expect(sh(repo, setup)).toMatchObject({ status: 0 })
    const before = sh(repo, verify)
    expect(before.status).toBe(1)
    expect(before.out).toMatch(/FAIL {2}test -f src\/shared.js/)

    // Do the work: only in-scope files change; scratch.txt was dirty before the run.
    fs.writeFileSync(path.join(repo, 'src/shared.js'), 'export const greet = (n) => "hi " + n\n')
    fs.writeFileSync(path.join(repo, 'src/a.js'), 'import { greet } from "./shared.js"\n')
    execFileSync('git', ['commit', '-am', 'step 2'], { cwd: repo, stdio: 'ignore' })
    const after = sh(repo, verify)
    expect(after.out).toMatch(/verify: all 3 checks passed/)
    expect(after.status).toBe(0)

    // Out-of-scope edit fails the scope check.
    fs.appendFileSync(path.join(repo, 'src/legacy.js'), '// touched\n')
    const scoped = sh(repo, verify)
    expect(scoped.status).toBe(1)
    expect(scoped.out).toMatch(/out of scope: src\/legacy.js/)
    execFileSync('git', ['checkout', '--', 'src/legacy.js'], { cwd: repo })

    // A STOP parks the loop (env class, exit 75).
    fs.writeFileSync(path.join(repo, loopRel, 'STOP.md'), 'excerpts do not match\n')
    const stopped = sh(repo, verify)
    expect(stopped.status).toBe(75)
    expect(stopped.out).toMatch(/^VERIFY_CLASS=env plan STOP condition/m)

    // Re-import refuses to clobber without --force.
    expect(() => importImprovePlans({ source: 'plans/001-extract-shared-helper.md', repoRoot: repo })).toThrow(/--force/)
  }, E2E_TIMEOUT_MS)

  it('parks setup.sh when in-scope files drifted after the planned-at commit', () => {
    const repo = initRepo()
    tmpDirs.push(repo)
    const sha = head(repo)
    fs.appendFileSync(path.join(repo, 'src/b.js'), '// someone else changed this\n')
    execFileSync('git', ['commit', '-am', 'drift'], { cwd: repo, stdio: 'ignore' })
    fs.mkdirSync(path.join(repo, 'plans'))
    fs.writeFileSync(path.join(repo, 'plans/001-x.md'), improvePlanFixture({ sha }).replace(/\| Install .*\n/, ''))

    importImprovePlans({ source: 'plans/001-x.md', repoRoot: repo })
    const r = sh(repo, '.cursor/loops/improve-001-x/setup.sh')
    expect(r.status).toBe(75)
    expect(r.out).toMatch(/plan drifted/)
    expect(r.out).toMatch(/src\/b.js/)

    const ignored = spawnSync('bash', ['.cursor/loops/improve-001-x/setup.sh'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, AGENT_LOOP_IGNORE_PLAN_DRIFT: '1' },
    })
    expect(ignored.status).toBe(0)
  }, E2E_TIMEOUT_MS)

  it('imports a plans directory into ordered loops plus a batch file', () => {
    const repo = initRepo()
    tmpDirs.push(repo)
    const plans = path.join(repo, 'plans')
    fs.mkdirSync(plans)
    fs.writeFileSync(path.join(plans, 'README.md'), improveIndexFixture)
    fs.writeFileSync(path.join(plans, '002-docs.md'), improvePlanFixture({ number: '002', dependsOn: '001' }))
    fs.writeFileSync(path.join(plans, '001-helper.md'), improvePlanFixture({ number: '001' }))
    fs.writeFileSync(path.join(plans, '003-old.md'), improvePlanFixture({ number: '003' }))

    const dry = importImprovePlans({ source: 'plans', repoRoot: repo, dryRun: true })
    expect(fs.existsSync(path.join(repo, '.cursor'))).toBe(false)
    expect(dry.written).toContain('.cursor/loops/improve-batch/loop-batch.json')

    const result = importImprovePlans({ source: 'plans', repoRoot: repo })
    expect(result.loops.map((l) => l.bundle.name)).toEqual(['improve-001-helper', 'improve-002-docs'])
    expect(result.skipped).toEqual([{ number: '003', reason: 'status DONE in plans/README.md' }])
    const batch = JSON.parse(fs.readFileSync(path.join(repo, '.cursor/loops/improve-batch/loop-batch.json'), 'utf8'))
    expect(parseLoopBatchConfig(batch).loops).toEqual([
      { path: 'improve-001-helper', rubric: 'Reviewer focus: confirm the greeting text is byte-identical.' },
      { path: 'improve-002-docs', rubric: 'Reviewer focus: confirm the greeting text is byte-identical.' },
    ])
    expect(
      resolveBatchLoopDir('improve-001-helper', path.join(repo, '.cursor/loops/improve-batch'), repo),
    ).toBe(path.join(repo, '.cursor/loops/improve-001-helper'))
    const bundle = loadLoopBundle(path.join(repo, '.cursor/loops/improve-001-helper'))
    expect(bundle.config).toMatchObject({ maxIterations: 4, reviewGate: true })
  }, E2E_TIMEOUT_MS)
})

#!/usr/bin/env node
import path from 'node:path'
import { resolveRepoContext } from '../context/repoContext.js'
import { importImprovePlans } from '../integrations/improveImport.js'
import { parseImportArgs } from './importArgs.js'

const parsed = parseImportArgs(process.argv.slice(2))
if (parsed.kind === 'help') {
  console.log(parsed.text)
  process.exit(0)
}
if (parsed.kind === 'error') {
  console.error(parsed.message)
  process.exit(1)
}

const cli = parsed.options
const ctx = resolveRepoContext({ repoRoot: cli.repoRoot })
const rel = (p: string) => path.relative(ctx.repoRoot, p) || '.'

let result: ReturnType<typeof importImprovePlans>
try {
  result = importImprovePlans({
    source: cli.source,
    repoRoot: ctx.repoRoot,
    out: cli.out,
    force: cli.force,
    dryRun: cli.dryRun,
  })
} catch (err) {
  console.error(`[agent-loop-import] ${(err as Error).message}`)
  process.exit(1)
}

for (const s of result.skipped) {
  console.log(`skip  plan ${s.number}: ${s.reason}`)
}

for (const l of result.loops) {
  const b = l.bundle
  console.log(`\nplan ${l.plan.number} → ${rel(l.loopDir)}`)
  console.log(
    `  verify.sh: ${b.checks.length} check(s) from ${b.checksFrom}${b.scopeCheck ? ' + scope check' : ''}`,
  )
  for (const c of b.checks) {
    console.log(`    ${c.expect.padEnd(7)} ${c.command}${c.inferred ? '   (expectation assumed)' : ''}`)
  }
  console.log(`  setup.sh: ${b.driftCheck ? `drift check vs ${l.plan.plannedAtSha}` : 'no drift check'}`)
  console.log(
    `  loop.json: maxIterations ${b.maxIterations}${b.reviewGate ? `, reviewGate on (${b.judgeCriteria.length} judge-checked criteria)` : ''}`,
  )
  for (const w of b.warnings) console.log(`  warn: ${w}`)
  for (const n of l.notes) console.log(n.replace(/^/gm, '  '))
}

if (result.loops.length === 0) {
  console.log('\nNothing to import.')
  process.exit(0)
}

console.log(`\n${cli.dryRun ? 'Would write' : 'Wrote'} ${result.written.length} file(s).`)
console.log('Review verify.sh and setup.sh (they run shell commands from the plan), then:')
if (result.batchDir) {
  console.log(`  pnpm exec agent-loop-batch ${rel(result.batchDir)} --trust-config`)
} else {
  console.log(`  pnpm exec agent-loop run ${rel(result.loops[0].loopDir)} --trust-config`)
}

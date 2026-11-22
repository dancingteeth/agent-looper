import fs from 'node:fs'
import path from 'node:path'
import { formatPreflightMessage, validateGoalPreflight } from '../loop/loopPreflight.js'
import { formatVerifyScriptLintMessage, lintVerifyScript } from '../loop/verifyScriptLint.js'
import {
  buildImproveBundle,
  IMPROVE_BATCH_DIR,
  improveLoopName,
  orderPlansForBatch,
  renderImproveBatch,
  type ImproveBundle,
} from './improveBundle.js'
import { parseImprovePlan, parsePlanIndex, type ImprovePlan, type PlanIndexRow } from './improvePlan.js'

export const DEFAULT_LOOPS_ROOT = '.cursor/loops'

export type ImportImproveOptions = {
  source: string
  repoRoot: string
  out?: string
  force?: boolean
  dryRun?: boolean
}

export type ImportedLoop = {
  plan: ImprovePlan
  bundle: ImproveBundle
  loopDir: string
  /** Preflight / verify-lint notes (warnings; errors abort before writing). */
  notes: string[]
}

export type ImportImproveResult = {
  loops: ImportedLoop[]
  skipped: { number: string; reason: string }[]
  batchDir?: string
  written: string[]
}

const PLAN_FILE = /^\d{3}-.+\.md$/

function toPosix(p: string): string {
  return p.split(path.sep).join('/')
}

function readPlanFiles(sourceAbs: string): { files: string[]; index: PlanIndexRow[]; isDir: boolean } {
  if (!fs.existsSync(sourceAbs)) throw new Error(`Not found: ${sourceAbs}`)
  if (fs.statSync(sourceAbs).isFile()) return { files: [sourceAbs], index: [], isDir: false }
  const files = fs
    .readdirSync(sourceAbs)
    .filter((f) => PLAN_FILE.test(f))
    .sort()
    .map((f) => path.join(sourceAbs, f))
  if (files.length === 0) throw new Error(`No NNN-*.md plans in ${sourceAbs}`)
  const readme = path.join(sourceAbs, 'README.md')
  const index = fs.existsSync(readme) ? parsePlanIndex(fs.readFileSync(readme, 'utf8')) : []
  return { files, index, isDir: true }
}

export function importImprovePlans(opts: ImportImproveOptions): ImportImproveResult {
  const repoRoot = path.resolve(opts.repoRoot)
  const sourceAbs = path.resolve(repoRoot, opts.source)
  const loopsRoot = path.resolve(repoRoot, opts.out ?? DEFAULT_LOOPS_ROOT)
  const { files, index, isDir } = readPlanFiles(sourceAbs)

  const plans = files.map((f) => {
    try {
      return { plan: parseImprovePlan(fs.readFileSync(f, 'utf8'), path.basename(f)), file: f }
    } catch (err) {
      throw new Error(`${toPosix(path.relative(repoRoot, f))}: ${(err as Error).message}`)
    }
  })
  const fileOf = new Map(plans.map((p) => [p.plan, p.file]))

  const { ordered, skipped } = isDir
    ? orderPlansForBatch(
        plans.map((p) => p.plan),
        index,
      )
    : { ordered: plans.map((p) => p.plan), skipped: [] }

  const loops: ImportedLoop[] = ordered.map((plan) => {
    const planRel = toPosix(path.relative(repoRoot, fileOf.get(plan)!))
    const loopDir = path.join(loopsRoot, improveLoopName(plan))
    const loopRel = toPosix(path.relative(repoRoot, loopDir))
    const bundle = buildImproveBundle(plan, { loopRel, planRel })

    const notes: string[] = []
    const preflight = validateGoalPreflight(bundle.files['GOAL.md'])
    if (!preflight.ok) {
      throw new Error(`Plan ${plan.number}: generated GOAL.md failed preflight\n${formatPreflightMessage(preflight)}`)
    }
    if (preflight.warnings.length > 0) notes.push(formatPreflightMessage(preflight))
    const lint = lintVerifyScript(bundle.files['verify.sh'])
    if (lint.errors.length > 0 || lint.warnings.length > 0) {
      notes.push(`verify.sh lint: ${formatVerifyScriptLintMessage(lint)}`)
    }
    return { plan, bundle, loopDir, notes }
  })

  if (loops.length === 0) {
    return { loops, skipped, written: [] }
  }

  if (!opts.force) {
    const targets = loops.map((l) => l.loopDir)
    if (isDir) targets.push(path.join(loopsRoot, IMPROVE_BATCH_DIR, 'loop-batch.json'))
    const existing = targets.filter((t) => fs.existsSync(t)).map((t) => toPosix(path.relative(repoRoot, t)))
    if (existing.length > 0) {
      throw new Error(`Loop bundle already exists (re-run with --force to overwrite): ${existing.join(', ')}`)
    }
  }

  const written: string[] = []
  const write = (file: string, content: string, mode?: number) => {
    written.push(toPosix(path.relative(repoRoot, file)))
    if (opts.dryRun) return
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, content, mode === undefined ? undefined : { mode })
    if (mode !== undefined) fs.chmodSync(file, mode)
  }

  for (const l of loops) {
    for (const [name, content] of Object.entries(l.bundle.files)) {
      write(path.join(l.loopDir, name), content, name.endsWith('.sh') ? 0o755 : undefined)
    }
  }

  let batchDir: string | undefined
  if (isDir) {
    batchDir = path.join(loopsRoot, IMPROVE_BATCH_DIR)
    write(
      path.join(batchDir, 'loop-batch.json'),
      renderImproveBatch(
        loops.map((l) => l.bundle),
        loops.map((l) => l.plan),
      ),
    )
  }

  return { loops, skipped, batchDir, written }
}

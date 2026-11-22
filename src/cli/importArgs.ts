import { parseRepoRootFlag, printRepoRootHelp } from './shared.js'

export type ImportCliOptions = {
  /** A plan file (`plans/001-x.md`) or a plans directory (`plans/`). */
  source: string
  /** Loops root (default `.cursor/loops`). */
  out?: string
  repoRoot?: string
  force: boolean
  dryRun: boolean
}

export type ParseImportArgsResult =
  | { kind: 'run'; options: ImportCliOptions }
  | { kind: 'help'; text: string }
  | { kind: 'error'; message: string }

export function importUsage(): string {
  return `Usage: agent-loop-import <plan.md | plans-dir> [options]

Turn shadcn/improve plans (https://github.com/shadcn/improve) into loop bundles.

  <plan.md>     One plan, e.g. plans/001-fix-n-plus-one.md → one loop
  <plans-dir>   Every NNN-*.md plan → one loop each + improve-batch/loop-batch.json
                (order and DONE/REJECTED/BLOCKED status from plans/README.md)

Each loop gets GOAL.md (frozen plan), verify.sh (the plan's Done criteria + scope
check), setup.sh (planned-at drift check + install), and a sparse loop.json.

Options:
  --out <dir>       Loops root (default: .cursor/loops)
  --force           Overwrite existing generated bundles
  --dry-run         Print what would be written; write nothing
${printRepoRootHelp()}`
}

/** Pure argv parser for the `agent-loop-import` CLI. */
export function parseImportArgs(argv: string[]): ParseImportArgsResult {
  let parsed: ReturnType<typeof parseRepoRootFlag>
  try {
    parsed = parseRepoRootFlag(argv)
  } catch (err) {
    return { kind: 'error', message: (err as Error).message }
  }
  const { remaining, repoRoot } = parsed
  const positional: string[] = []
  let out: string | undefined
  let force = false
  let dryRun = false

  for (let i = 0; i < remaining.length; i++) {
    const arg = remaining[i]
    if (arg === '--help' || arg === '-h') return { kind: 'help', text: importUsage() }
    if (arg === '--force') {
      force = true
      continue
    }
    if (arg === '--dry-run') {
      dryRun = true
      continue
    }
    if (arg === '--out') {
      out = remaining[++i]
      if (!out) return { kind: 'error', message: '--out requires a directory' }
      continue
    }
    if (arg.startsWith('--')) return { kind: 'error', message: `Unknown option ${arg}\n\n${importUsage()}` }
    positional.push(arg)
  }

  if (positional.length !== 1) return { kind: 'error', message: importUsage() }
  return { kind: 'run', options: { source: positional[0], out, repoRoot, force, dryRun } }
}

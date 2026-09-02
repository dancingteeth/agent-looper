import { printRepoRootHelp } from './shared.js'

export type WatchCliOptions = {
  loopDir?: string
  repoRoot?: string
  snapshot: boolean
  pulse: boolean
  plain: boolean
}

export type ParseWatchArgsResult =
  | { kind: 'watch'; options: WatchCliOptions }
  | { kind: 'help'; text: string }
  | { kind: 'error'; message: string }

export function watchUsage(): string {
  return `Usage: agent-loop watch <loop-dir> [options]

  <loop-dir>   Path to a loop bundle (log.ndjson lives inside)

Options:
  --snapshot             Print one frame from on-disk artifacts and exit (no PTY)
  --pulse                Print pid / log / stream health and exit (same as Ink s)
  --plain                Plain phase lines instead of the Ink watch view
${printRepoRootHelp()}
  --help, -h             Show this help
`
}

/** Pure argv parser for `agent-loop watch`; watch.ts maps the result to stdout/exit codes. */
export function parseWatchArgs(argv: string[]): ParseWatchArgsResult {
  const positional: string[] = []
  let repoRoot: string | undefined
  let snapshot = false
  let pulse = false
  let plain = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--repo-root') {
      const raw = argv[++i]
      if (!raw) {
        return { kind: 'error', message: '--repo-root requires a path' }
      }
      repoRoot = raw
      continue
    }
    if (arg === '--snapshot') {
      snapshot = true
      continue
    }
    if (arg === '--pulse') {
      pulse = true
      continue
    }
    if (arg === '--plain') {
      plain = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      return { kind: 'help', text: watchUsage() }
    }
    positional.push(arg)
  }

  const loopDir = positional.join(' ').trim()
  if (!loopDir) {
    return { kind: 'error', message: watchUsage() }
  }

  return {
    kind: 'watch',
    options: { loopDir, repoRoot, snapshot, pulse, plain },
  }
}

import { parseRepoRootFlag, printRepoRootHelp } from './shared.js'

export type PromptCliOptions = {
  outDir: string
  repoRoot: string
  prompt?: string
  plain: boolean
  noRun: boolean
  yes: boolean
}

export type ParsePromptArgsResult =
  | { kind: 'prompt'; options: PromptCliOptions }
  | { kind: 'help'; text: string }
  | { kind: 'error'; message: string }

export function promptUsage(): string {
  return `Usage: agent-loop-prompt --out <loop-dir> [options]

Type an idea; the configured judge (reviewRuntime/reviewModel) scaffolds GOAL.md + verify.sh
(and optional docs), pauses for freeze, then hands off to agent-loop run
with the existing watch TUI. After a green run, optional loop.json preview
starts in the background.

Requires loop.json from agent-loop-setup in --out.

Options:
  --out <loop-dir>       Loop bundle directory (required)
  --prompt <text>        Skip the multiline editor (agents / scripts)
  --plain                Numbered/plain output instead of Ink TUI
  --no-run               Scaffold + freeze only; print run command
  --yes                  Skip freeze confirm (agents only)
${printRepoRootHelp()}
  --help, -h             Show this help
`
}

export function parsePromptArgs(argv: string[]): ParsePromptArgsResult {
  const { remaining, repoRoot: repoRootFlag } = parseRepoRootFlag(argv)
  let outDir: string | undefined
  let prompt: string | undefined
  let plain = false
  let noRun = false
  let yes = false

  for (let i = 0; i < remaining.length; i++) {
    const arg = remaining[i]
    switch (arg) {
      case '--':
        break
      case '--out':
        outDir = remaining[++i]
        if (!outDir) return { kind: 'error', message: '--out requires a path' }
        break
      case '--prompt':
        prompt = remaining[++i]
        if (prompt === undefined) return { kind: 'error', message: '--prompt requires text' }
        break
      case '--plain':
        plain = true
        break
      case '--no-run':
        noRun = true
        break
      case '--yes':
        yes = true
        break
      case '--help':
      case '-h':
        return { kind: 'help', text: promptUsage() }
      default:
        return { kind: 'error', message: `Unknown option: ${arg}\n${promptUsage()}` }
    }
  }

  if (!outDir) {
    return { kind: 'error', message: promptUsage() }
  }

  return {
    kind: 'prompt',
    options: {
      outDir,
      repoRoot: repoRootFlag ?? process.cwd(),
      prompt,
      plain,
      noRun,
      yes,
    },
  }
}

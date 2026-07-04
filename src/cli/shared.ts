export type CommonCliOptions = {
  repoRoot?: string
  verbose: boolean
}

export function parseVerboseFlag(argv: string[]): { args: string[]; verbose: boolean } {
  const args = [...argv]
  let verbose =
    process.env.AGENT_LOOP_VERBOSE === '1' || process.env.AGENT_LOOP_VERBOSE === 'true'

  const filtered: string[] = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--verbose' || arg === '-v') {
      verbose = true
      continue
    }
    filtered.push(arg)
  }

  return { args: filtered, verbose }
}

export function parseRepoRootFlag(args: string[]): { remaining: string[]; repoRoot?: string } {
  const remaining: string[] = []
  let repoRoot: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--repo-root') {
      repoRoot = args[++i]
      if (!repoRoot) {
        throw new Error('--repo-root requires a path')
      }
      continue
    }
    remaining.push(arg)
  }

  return { remaining, repoRoot }
}

export function printRepoRootHelp(): string {
  return `  --repo-root <path>   Target repository (default: process.cwd())`
}

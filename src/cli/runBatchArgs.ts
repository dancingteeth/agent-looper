import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

export type RunBatchCliOptions = {
  batchDir: string
  repoRoot?: string
  verbose: boolean
  skipSync: boolean
  notifyTelegram?: boolean
  trustConfig?: boolean
  requireTrustConfig: boolean
  requireNotify?: boolean
  noCompletionSignal?: boolean
}

export type ParseRunBatchArgsResult =
  | { kind: 'run'; options: RunBatchCliOptions }
  | { kind: 'help'; text: string }
  | { kind: 'error'; message: string }

export function runBatchUsage(): string {
  return `Usage: agent-loop-batch <batch-dir> [options]

  <batch-dir>   Directory containing loop-batch.json

Options:
  --verbose, -v     Tool args/results on stderr
${printRepoRootHelp()}
  --skip-sync       Do not run repo profile syncCommand after batch
  --no-telegram     Skip Telegram completion report
  --no-completion-signal  Skip AGENT_LOOP_DONE stdout line (Cursor background wake)
  --require-notify  Abort if Telegram notify is configured but getMe preflight fails
  --trust-config    Acknowledge reviewed shell commands
  --require-trust-config  Abort unless trusted (see agent-loop run --help)`
}

/** Pure argv parser for the `agent-loop-batch` CLI (see parseRunArgs). */
export function parseRunBatchArgs(argv: string[]): ParseRunBatchArgsResult {
  const { args: verboseStripped, verbose } = parseVerboseFlag(argv)
  const { remaining, repoRoot } = parseRepoRootFlag(verboseStripped)

  const positional: string[] = []
  let skipSync = false
  let notifyTelegram: boolean | undefined
  let trustConfig: boolean | undefined
  let requireTrustConfig = false
  let requireNotify = false
  let noCompletionSignal = false

  for (const arg of remaining) {
    if (arg === '--') continue
    if (arg === '--skip-sync') {
      skipSync = true
      continue
    }
    if (arg === '--no-telegram') {
      notifyTelegram = false
      continue
    }
    if (arg === '--no-completion-signal') {
      noCompletionSignal = true
      continue
    }
    if (arg === '--require-notify') {
      requireNotify = true
      continue
    }
    if (arg === '--trust-config') {
      trustConfig = true
      continue
    }
    if (arg === '--require-trust-config') {
      requireTrustConfig = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      return { kind: 'help', text: runBatchUsage() }
    }
    positional.push(arg)
  }

  const batchDir = positional.join(' ').trim()
  if (!batchDir) {
    return { kind: 'error', message: runBatchUsage() }
  }

  return {
    kind: 'run',
    options: {
      batchDir,
      repoRoot,
      verbose,
      skipSync,
      notifyTelegram,
      trustConfig,
      requireTrustConfig,
      requireNotify,
      noCompletionSignal,
    },
  }
}

import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

export type RunCliOptions = {
  loopDir: string
  repoRoot?: string
  verbose: boolean
  maxIterations?: number
  verify?: string
  finalVerify?: string
  qualityReview?: boolean | 'off'
  reviewGate?: boolean
  skipSync?: boolean
  runtime?: 'cursor' | 'cline-pass' | 'cline' | 'opencode'
  model?: string
  reviewModel?: string
  escalateModel?: string
  mode?: 'forward' | 'reverse'
  pauseAfterIteration?: boolean
  notifyTelegram?: boolean
  trustConfig?: boolean
  requireTrustConfig?: boolean
}

export type ParseRunArgsResult =
  | { kind: 'run'; options: RunCliOptions }
  | { kind: 'help'; text: string }
  | { kind: 'error'; message: string }

export function runUsage(): string {
  return `Usage: agent-loop run <loop-dir> [options]

  <loop-dir>   Path to a loop bundle (GOAL.md + loop.json)

Options:
  --verbose, -v                   Tool args/results on stderr
${printRepoRootHelp()}
  --max-iterations <n>            Override loop.json maxIterations
  --verify <shell-cmd>            Override loop.json verify command
  --final-verify <cmd>            Override loop.json finalVerify
  --quality-review                Force advisory post-success review
  --no-quality-review             Skip post-success review
  --review-gate                   Require review verdict != BLOCKERS to complete
  --no-review-gate                Disable review gate (default from loop.json)
  --skip-sync                     Do not run repo profile syncCommand
  --runtime <cursor|cline-pass|cline|opencode>  Override loop.json runtime (cline = credits; opencode = OpenCode Go)
  --model <id>                    Override loop.json worker model
  --review-model <id>             Override loop.json reviewModel (Cursor judge; default grok-4.5 on cursor)
  --escalate-model <id>           Override loop.json escalateModel
  --mode <forward|reverse>        Loop mode (default from loop.json)
  --pause-after-iteration         Wait for Enter between iterations (TTY only)
  --no-telegram                   Skip Telegram completion report
  --trust-config                  Acknowledge reviewed shell commands (verify / finalVerify / sync)
  --require-trust-config          Abort unless --trust-config, loop.json trustConfig, or AGENT_LOOP_TRUST_CONFIG=1

Cursor-only hackathon tip:
  --runtime cursor --review-gate
  # worker = composer-2.5, judge = grok-4.5 (no Cline / 3rd-party)

Each iteration: fresh agent → shell verifier → append log.ndjson`
}

/**
 * Pure argv parser for the `agent-loop` CLI. Returns a discriminated result
 * instead of printing/exiting so it can be unit-tested; run.ts maps the
 * result to stdout/stderr + exit codes.
 */
export function parseRunArgs(argv: string[]): ParseRunArgsResult {
  const { args: verboseStripped, verbose } = parseVerboseFlag(argv)
  const { remaining, repoRoot } = parseRepoRootFlag(verboseStripped)

  const positional: string[] = []
  let maxIterations: number | undefined
  let verify: string | undefined
  let finalVerify: string | undefined
  let qualityReview: boolean | 'off' | undefined
  let reviewGate: boolean | undefined
  let skipSync = false
  let runtime: RunCliOptions['runtime']
  let model: string | undefined
  let reviewModel: string | undefined
  let escalateModel: string | undefined
  let mode: RunCliOptions['mode']
  let pauseAfterIteration: boolean | undefined
  let notifyTelegram: boolean | undefined
  let trustConfig: boolean | undefined
  let requireTrustConfig = false

  for (let i = 0; i < remaining.length; i++) {
    const arg = remaining[i]
    if (arg === 'run') {
      continue
    }
    if (arg === '--') {
      continue
    }
    if (arg === '--max-iterations') {
      const raw = remaining[++i]
      if (raw === undefined || raw.startsWith('-')) {
        return { kind: 'error', message: '--max-iterations requires a number' }
      }
      maxIterations = Number(raw)
      if (!Number.isFinite(maxIterations) || maxIterations < 1) {
        return {
          kind: 'error',
          message: `--max-iterations must be a positive integer (got ${raw})`,
        }
      }
      continue
    }
    if (arg === '--verify') {
      verify = remaining[++i]
      continue
    }
    if (arg === '--final-verify') {
      finalVerify = remaining[++i]
      continue
    }
    if (arg === '--quality-review') {
      qualityReview = true
      continue
    }
    if (arg === '--no-quality-review') {
      qualityReview = 'off'
      continue
    }
    if (arg === '--review-gate') {
      reviewGate = true
      continue
    }
    if (arg === '--no-review-gate') {
      reviewGate = false
      continue
    }
    if (arg === '--skip-sync') {
      skipSync = true
      continue
    }
    if (arg === '--runtime') {
      const value = remaining[++i]
      if (
        value !== 'cursor' &&
        value !== 'cline-pass' &&
        value !== 'cline' &&
        value !== 'opencode'
      ) {
        return { kind: 'error', message: '--runtime must be cursor, cline-pass, cline, or opencode' }
      }
      runtime = value
      continue
    }
    if (arg === '--model') {
      model = remaining[++i]
      continue
    }
    if (arg === '--review-model') {
      reviewModel = remaining[++i]
      continue
    }
    if (arg === '--escalate-model') {
      escalateModel = remaining[++i]
      continue
    }
    if (arg === '--mode') {
      const value = remaining[++i]
      if (value !== 'forward' && value !== 'reverse') {
        return { kind: 'error', message: '--mode must be forward or reverse' }
      }
      mode = value
      continue
    }
    if (arg === '--pause-after-iteration') {
      pauseAfterIteration = true
      continue
    }
    if (arg === '--no-telegram') {
      notifyTelegram = false
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
      return { kind: 'help', text: runUsage() }
    }
    positional.push(arg)
  }

  const loopDir = positional.join(' ').trim()
  if (!loopDir) {
    return { kind: 'error', message: runUsage() }
  }

  return {
    kind: 'run',
    options: {
      loopDir,
      repoRoot,
      verbose,
      maxIterations,
      verify,
      finalVerify,
      qualityReview,
      reviewGate,
      skipSync,
      runtime,
      model,
      reviewModel,
      escalateModel,
      mode,
      pauseAfterIteration,
      notifyTelegram,
      trustConfig,
      requireTrustConfig,
    },
  }
}

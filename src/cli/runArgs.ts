import { LOOP_RUNTIME_VALUES, type LoopRuntime } from '../loop/loopAgentConfig.js'
import { loopRuntimeFlagError, parseLoopRuntimeCli } from '../loop/loopConfig.js'
import { parseRepoRootFlag, parseVerboseFlag, printRepoRootHelp } from './shared.js'

const RUNTIME_FLAG_UNION = LOOP_RUNTIME_VALUES.join('|')

export type RunCliOptions = {
  loopDir: string
  repoRoot?: string
  verbose: boolean
  maxIterations?: number
  maxCostUsd?: number
  verify?: string
  finalVerify?: string
  qualityReview?: boolean | 'off'
  reviewGate?: boolean
  skipSync?: boolean
  runtime?: LoopRuntime
  reviewRuntime?: LoopRuntime
  model?: string
  reviewModel?: string
  reviewSecondaryRuntime?: LoopRuntime
  reviewSecondaryModel?: string
  escalateModel?: string
  mode?: 'forward' | 'reverse'
  pauseAfterIteration?: boolean
  notifyTelegram?: boolean
  trustConfig?: boolean
  requireTrustConfig?: boolean
  requireNotify?: boolean
  noCompletionSignal?: boolean
  noNotifyCommand?: boolean
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
  --max-cost <n>                  Dollar cap (billed if >$0, else API list); stop waiting when crossed
  --verify <shell-cmd>            Override loop.json verify command
  --final-verify <cmd>            Override loop.json finalVerify
  --quality-review                Force advisory post-success review
  --no-quality-review             Skip post-success review
  --review-gate                   Require review verdict != BLOCKERS to complete
  --no-review-gate                Disable review gate (default from loop.json)
  --skip-sync                     Do not run repo profile syncCommand
  --runtime <${RUNTIME_FLAG_UNION}>  Override loop.json runtime
  --model <id>                    Override loop.json worker model
  --review-runtime <${RUNTIME_FLAG_UNION}>  Override loop.json reviewRuntime (judge)
  --review-model <id>             Override loop.json reviewModel (judge model)
  --review-secondary-runtime <${RUNTIME_FLAG_UNION}>  Override loop.json reviewSecondaryRuntime
  --review-secondary-model <id>   Override loop.json reviewSecondaryModel
  --escalate-model <id>           Override loop.json escalateModel
  --mode <forward|reverse>        Loop mode (default from loop.json)
  --pause-after-iteration         Wait for Enter between iterations (TTY only)
  --no-telegram                   Skip Telegram completion report
  --no-completion-signal          Skip AGENT_LOOP_DONE stdout line (Cursor background wake)
  --no-notify-command             Skip repo/loop notifyCommand shell hook
  --require-notify                Abort if Telegram notify is configured but getMe preflight fails
  --trust-config                  Acknowledge reviewed shell commands (verify / finalVerify / sync)
  --require-trust-config          Abort unless --trust-config, loop.json trustConfig, or AGENT_LOOP_TRUST_CONFIG=1

Cursor-only hackathon tip:
  --runtime cursor --review-gate
  # worker = composer-2.5, judge = grok-4.6 (no Cline / 3rd-party)

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
  let maxCostUsd: number | undefined
  let verify: string | undefined
  let finalVerify: string | undefined
  let qualityReview: boolean | 'off' | undefined
  let reviewGate: boolean | undefined
  let skipSync = false
  let runtime: RunCliOptions['runtime']
  let reviewRuntime: RunCliOptions['reviewRuntime']
  let model: string | undefined
  let reviewModel: string | undefined
  let reviewSecondaryRuntime: RunCliOptions['reviewSecondaryRuntime']
  let reviewSecondaryModel: string | undefined
  let escalateModel: string | undefined
  let mode: RunCliOptions['mode']
  let pauseAfterIteration: boolean | undefined
  let notifyTelegram: boolean | undefined
  let trustConfig: boolean | undefined
  let requireTrustConfig = false
  let requireNotify = false
  let noCompletionSignal = false
  let noNotifyCommand = false

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
    if (arg === '--max-cost') {
      const raw = remaining[++i]
      if (raw === undefined || raw.startsWith('-')) {
        return { kind: 'error', message: '--max-cost requires a number' }
      }
      maxCostUsd = Number(raw)
      if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
        return {
          kind: 'error',
          message: `--max-cost must be a positive number (got ${raw})`,
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
      const parsed = parseLoopRuntimeCli(remaining[++i])
      if (!parsed) {
        return { kind: 'error', message: loopRuntimeFlagError('--runtime') }
      }
      runtime = parsed
      continue
    }
    if (arg === '--model') {
      model = remaining[++i]
      continue
    }
    if (arg === '--review-runtime') {
      const parsed = parseLoopRuntimeCli(remaining[++i])
      if (!parsed) {
        return { kind: 'error', message: loopRuntimeFlagError('--review-runtime') }
      }
      reviewRuntime = parsed
      continue
    }
    if (arg === '--review-model') {
      reviewModel = remaining[++i]
      continue
    }
    if (arg === '--review-secondary-runtime') {
      const parsed = parseLoopRuntimeCli(remaining[++i])
      if (!parsed) {
        return { kind: 'error', message: loopRuntimeFlagError('--review-secondary-runtime') }
      }
      reviewSecondaryRuntime = parsed
      continue
    }
    if (arg === '--review-secondary-model') {
      reviewSecondaryModel = remaining[++i]
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
    if (arg === '--no-completion-signal') {
      noCompletionSignal = true
      continue
    }
    if (arg === '--no-notify-command') {
      noNotifyCommand = true
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
      maxCostUsd,
      verify,
      finalVerify,
      qualityReview,
      reviewGate,
      skipSync,
      runtime,
      model,
      reviewRuntime,
      reviewModel,
      reviewSecondaryRuntime,
      reviewSecondaryModel,
      escalateModel,
      mode,
      pauseAfterIteration,
      notifyTelegram,
      trustConfig,
      requireTrustConfig,
      requireNotify,
      noCompletionSignal,
      noNotifyCommand,
    },
  }
}

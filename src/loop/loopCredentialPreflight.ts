import type { LoopConfig } from './loopConfig.js'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  type LoopRuntime,
} from './loopAgentConfig.js'

export type CredentialNeed = {
  role: 'worker' | 'judge' | 'judge-secondary'
  runtime: LoopRuntime
  need: string
}

function envSet(name: string, env: NodeJS.ProcessEnv): boolean {
  return Boolean(env[name]?.trim())
}

/** Env var (or one-of list) that must be set for this runtime, if any. */
export function requiredCredentialNeed(
  runtime: LoopRuntime,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  switch (runtime) {
    case LOOP_RUNTIME_CURSOR:
      return envSet('CURSOR_API_KEY', env) ? undefined : 'CURSOR_API_KEY'
    case LOOP_RUNTIME_CLINE:
    case LOOP_RUNTIME_CLINE_PASS:
      return envSet('CLINE_API_KEY', env) ? undefined : 'CLINE_API_KEY'
    case LOOP_RUNTIME_PI: {
      const names = [
        'OPENROUTER_API_KEY',
        'ANTHROPIC_API_KEY',
        'OPENAI_API_KEY',
        'GOOGLE_API_KEY',
      ] as const
      return names.some((name) => envSet(name, env))
        ? undefined
        : 'OPENROUTER_API_KEY (or ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY)'
    }
    case LOOP_RUNTIME_OPENCODE:
    case LOOP_RUNTIME_CODEX:
    case LOOP_RUNTIME_DSH:
    case LOOP_RUNTIME_MUSE:
      return undefined
    default: {
      const _exhaustive: never = runtime
      return _exhaustive
    }
  }
}

function judgeWillRun(config: Pick<LoopConfig, 'postQualityReview'>): boolean {
  return config.postQualityReview !== false
}

export function listMissingLoopCredentials(
  config: Pick<
    LoopConfig,
    'runtime' | 'reviewRuntime' | 'postQualityReview' | 'reviewSecondaryRuntime'
  >,
  env: NodeJS.ProcessEnv = process.env,
): CredentialNeed[] {
  const missing: CredentialNeed[] = []
  const workerNeed = requiredCredentialNeed(config.runtime, env)
  if (workerNeed !== undefined) {
    missing.push({ role: 'worker', runtime: config.runtime, need: workerNeed })
  }
  if (!judgeWillRun(config)) return missing

  const reviewRuntime = config.reviewRuntime ?? LOOP_RUNTIME_CURSOR
  const judgeNeed = requiredCredentialNeed(reviewRuntime, env)
  if (judgeNeed !== undefined) {
    missing.push({ role: 'judge', runtime: reviewRuntime, need: judgeNeed })
  }
  if (config.reviewSecondaryRuntime) {
    const secondaryNeed = requiredCredentialNeed(config.reviewSecondaryRuntime, env)
    if (secondaryNeed !== undefined) {
      missing.push({
        role: 'judge-secondary',
        runtime: config.reviewSecondaryRuntime,
        need: secondaryNeed,
      })
    }
  }
  return missing
}

export function formatMissingLoopCredentials(missing: readonly CredentialNeed[]): string {
  return [
    'Missing credentials — aborting before WORKER.',
    ...missing.map(
      (item) =>
        `  ${item.role} (${item.runtime}): ${item.need} is not set. Run via doppler or agent-check ${item.runtime}`,
    ),
  ].join('\n')
}

/** Fail fast when worker/judge API keys are missing so a green verify cannot die on the judge. */
export function assertLoopCredentials(
  config: Pick<
    LoopConfig,
    'runtime' | 'reviewRuntime' | 'postQualityReview' | 'reviewSecondaryRuntime'
  >,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const missing = listMissingLoopCredentials(config, env)
  if (missing.length === 0) return
  throw new Error(formatMissingLoopCredentials(missing))
}

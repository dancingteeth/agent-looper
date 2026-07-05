import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  validateLoopAgentConfig,
} from './loopAgentConfig.js'
import {
  hitlCheckDescriptionSchema,
  taskwarriorProjectSchema,
  taskwarriorUuidSchema,
} from '../integrations/taskwarrior.js'
import { formatPreflightMessage, validateGoalPreflight } from './loopPreflight.js'
import { loopModeSchema } from './loopMode.js'

export const loopRuntimeSchema = z.enum([LOOP_RUNTIME_CURSOR, LOOP_RUNTIME_CLINE_PASS])

export const loopConfigSchema = z
  .object({
    maxIterations: z.number().int().min(1).max(50).default(8),
    verify: z.string().min(1),
    finalVerify: z.string().optional(),
    runtime: loopRuntimeSchema.default(LOOP_RUNTIME_CURSOR),
    model: z.string().optional(),
    escalateModel: z.string().optional(),
    escalateAfterStagnation: z.number().int().min(1).max(10).default(2),
    taskwarriorUuid: taskwarriorUuidSchema.optional(),
    /** Override repo profile taskwarriorProject for HITL tasks. */
    taskwarriorProject: taskwarriorProjectSchema.optional(),
    delayMs: z.number().int().min(0).max(60_000).default(1500),
    postQualityReview: z.union([z.boolean(), z.literal('auto')]).default('auto'),
    /** When true, post-success review must not return BLOCKERS to complete the loop. */
    reviewGate: z.boolean().default(false),
    /** Max review-triggered fix rounds when reviewGate is on (each cycle re-runs review). */
    maxReviewCycles: z.number().int().min(1).max(5).default(2),
    /** Run repo profile syncCommand after success. Legacy alias: syncPostgres. */
    syncOnSuccess: z.boolean().default(true),
    hitlCheck: hitlCheckDescriptionSchema.optional(),
    stagnationThreshold: z.number().int().min(0).max(10).default(3),
    /** forward = incremental fix; reverse = clean-room rebuild toward goal. */
    mode: loopModeSchema,
    /** Wait for Enter between iterations (watch-the-loop tuning). Skipped when stdin is not a TTY. */
    pauseAfterIteration: z.boolean().default(false),
    /** Read failure-context.md written by a meta-loop probe into the prompt. */
    injectFailureContext: z.boolean().default(false),
  })
  .superRefine((config, ctx) => {
    try {
      validateLoopAgentConfig(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const issuePath = message.includes('escalateModel') ? ['escalateModel'] : ['model']
      ctx.addIssue({ code: 'custom', message, path: issuePath })
    }
  })

export type LoopConfig = z.infer<typeof loopConfigSchema>

export type LoadedLoopBundle = {
  loopDir: string
  goal: string
  config: LoopConfig
  logPath: string
}

/** Accept legacy loop.json field `syncPostgres` as alias for syncOnSuccess. */
export function parseLoopConfig(raw: unknown): LoopConfig {
  if (typeof raw === 'object' && raw !== null && 'syncPostgres' in raw) {
    const record = raw as Record<string, unknown>
    const { syncPostgres, ...rest } = record
    if (typeof syncPostgres === 'boolean' && !('syncOnSuccess' in rest)) {
      return loopConfigSchema.parse({ ...rest, syncOnSuccess: syncPostgres })
    }
  }
  return loopConfigSchema.parse(raw)
}

export function resolveLoopDir(loopDirArg: string, repoRoot: string): string {
  const resolved = path.isAbsolute(loopDirArg) ? loopDirArg : path.join(repoRoot, loopDirArg)
  return path.resolve(resolved)
}

export function loadLoopBundle(loopDir: string): LoadedLoopBundle {
  const goalPath = path.join(loopDir, 'GOAL.md')
  const configPath = path.join(loopDir, 'loop.json')

  if (!fs.existsSync(goalPath)) {
    throw new Error(`Missing GOAL.md in ${loopDir}`)
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing loop.json in ${loopDir}`)
  }

  const goal = fs.readFileSync(goalPath, 'utf8').trim()
  if (!goal) {
    throw new Error(`GOAL.md is empty in ${loopDir}`)
  }

  const preflight = validateGoalPreflight(goal)
  if (preflight.warnings.length > 0) {
    console.error(
      `[agent-loop] GOAL.md preflight warnings for ${loopDir}:\n${formatPreflightMessage({ ...preflight, errors: [] })}`,
    )
  }
  if (!preflight.ok) {
    throw new Error(
      `GOAL.md preflight failed in ${loopDir}:\n${formatPreflightMessage(preflight)}\nSee templates/GOAL.template.md`,
    )
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
  const config = parseLoopConfig(raw)

  return {
    loopDir,
    goal,
    config,
    logPath: path.join(loopDir, 'log.ndjson'),
  }
}

export function mergeLoopConfig(
  base: LoopConfig,
  overrides: Partial<
    Pick<
      LoopConfig,
      | 'maxIterations'
      | 'verify'
      | 'finalVerify'
      | 'postQualityReview'
      | 'reviewGate'
      | 'maxReviewCycles'
      | 'syncOnSuccess'
      | 'runtime'
      | 'model'
      | 'escalateModel'
      | 'taskwarriorProject'
      | 'mode'
      | 'pauseAfterIteration'
      | 'injectFailureContext'
    >
  >,
): LoopConfig {
  return loopConfigSchema.parse({
    ...base,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  })
}

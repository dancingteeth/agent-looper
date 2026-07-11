import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  LOOP_REASONING_EFFORTS,
  validateLoopAgentConfig,
} from './loopAgentConfig.js'
import {
  hitlCheckDescriptionSchema,
  taskwarriorProjectSchema,
  taskwarriorUuidSchema,
} from '../integrations/taskwarrior.js'
import { formatPreflightMessage, validateGoalPreflight } from './loopPreflight.js'
import { loopExtensionFieldsSchema } from './loopExtensions.js'
import { migrateLegacySyncPostgres } from './loopConfigLegacy.js'
import { loopModeSchema } from './loopMode.js'

export const loopRuntimeSchema = z.enum([LOOP_RUNTIME_CURSOR, LOOP_RUNTIME_CLINE_PASS])

export const loopConfigSchema = loopExtensionFieldsSchema
  .extend({
    maxIterations: z.number().int().min(1).max(50).default(8),
    verify: z.string().min(1),
    finalVerify: z.string().optional(),
    runtime: loopRuntimeSchema.default(LOOP_RUNTIME_CURSOR),
    model: z.string().optional(),
    escalateModel: z.string().optional(),
    escalateAfterStagnation: z.number().int().min(1).max(10).default(2),
    /** Reasoning-effort dial for ClinePass models (low|medium|high|xhigh|none). Cursor ignores it. */
    reasoningEffort: z.enum(LOOP_REASONING_EFFORTS).optional(),
    /** Reasoning effort to use once stagnation reaches escalateAfterStagnation (ClinePass only). */
    escalateReasoningEffort: z.enum(LOOP_REASONING_EFFORTS).optional(),
    /** Tiers to step reasoning effort up per iteration once past iteration 1 (ClinePass only). */
    reasoningEscalationStep: z.number().int().min(1).max(2).default(1),
    /** Reasoning tier to use on the escalated model (e.g. qwen). Defaults to the ceiling tier. */
    escalateModelReasoningEffort: z.enum(LOOP_REASONING_EFFORTS).optional(),
    taskwarriorUuid: taskwarriorUuidSchema.optional(),
    /** Override repo profile taskwarriorProject for HITL tasks. */
    taskwarriorProject: taskwarriorProjectSchema.optional(),
    delayMs: z.number().int().min(0).max(60_000).default(1500),
    postQualityReview: z.union([z.boolean(), z.literal('auto')]).default('auto'),
    /** When true, post-success review must not return BLOCKERS to complete the loop. */
    reviewGate: z.boolean().default(false),
    /** Max review-triggered fix rounds when reviewGate is on (each cycle re-runs review). */
    maxReviewCycles: z.number().int().min(1).max(5).default(2),
    /** When reviewGate exhausts, escalate to a human (HITL task) instead of hard-failing. */
    reviewGateHitl: z.boolean().default(false),
    /** Max retries for a transient UNKNOWN (unparseable) review verdict, independent of maxReviewCycles. */
    unparseableReviewRetries: z.number().int().min(1).max(5).default(2),
    /** On a BLOCKERS fix round, run the lighter scope-limited blocker re-check instead of the full review. */
    reviewBlockerRecheck: z.boolean().default(true),
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
    /** Send completion report to Telegram when repo profile + env are configured. */
    notifyTelegram: z.boolean().default(true),
    /** Attach latest review.md to Telegram after the completion summary (when present). */
    telegramAttachReview: z.boolean().default(true),
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
  return loopConfigSchema.parse(migrateLegacySyncPostgres(raw))
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
      | 'reviewGateHitl'
      | 'unparseableReviewRetries'
      | 'reviewBlockerRecheck'
      | 'syncOnSuccess'
      | 'runtime'
      | 'model'
      | 'escalateModel'
      | 'reasoningEffort'
      | 'escalateReasoningEffort'
      | 'reasoningEscalationStep'
      | 'escalateModelReasoningEffort'
      | 'taskwarriorProject'
      | 'mode'
      | 'pauseAfterIteration'
      | 'injectFailureContext'
      | 'notifyTelegram'
    >
  >,
): LoopConfig {
  return loopConfigSchema.parse({
    ...base,
    ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)),
  })
}

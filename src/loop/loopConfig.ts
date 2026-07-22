import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import {
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CURSOR,
  LOOP_REASONING_EFFORTS,
  clearIncompatibleAgentFieldsOnRuntimeSwitch,
  validateLoopAgentConfig,
  type LoopRuntime,
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

export const loopRuntimeSchema = z.enum([
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CLINE,
])

export const loopVerifyModeSchema = z.enum(['command', 'skill']).default('command')

export const loopConfigSchema = loopExtensionFieldsSchema
  .extend({
    maxIterations: z.number().int().min(1).max(50).default(8),
    verify: z.string().min(1),
    /** command = shell verify only (default); skill = agent reads verifySkill then runs verify shell. */
    verifyMode: loopVerifyModeSchema,
    /** Path to VERIFY.skill.md — required when verifyMode is skill (loop dir or repo root). */
    verifySkill: z.string().trim().min(1).optional(),
    finalVerify: z.string().optional(),
    runtime: loopRuntimeSchema.default(LOOP_RUNTIME_CURSOR),
    model: z.string().optional(),
    /** Cursor SDK model for quality review / review-gate. Unset → resolveReviewModel(). */
    reviewModel: z.string().optional(),
    escalateModel: z.string().optional(),
    escalateAfterStagnation: z.number().int().min(1).max(10).default(2),
    /** Reasoning-effort dial for Cline SDK models (low|medium|high|xhigh|none). Cursor ignores it. */
    reasoningEffort: z.enum(LOOP_REASONING_EFFORTS).optional(),
    /** Reasoning effort to use once stagnation reaches escalateAfterStagnation (Cline runtimes only). */
    escalateReasoningEffort: z.enum(LOOP_REASONING_EFFORTS).optional(),
    /** Tiers to step reasoning effort up per iteration once past iteration 1 (Cline runtimes only). */
    reasoningEscalationStep: z.number().int().min(1).max(2).default(1),
    /** Reasoning tier to use on the escalated model. Defaults to the ceiling tier. */
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
    /**
     * When true, downgrade error+impact blockers that lack a citeable path in the
     * merge-base…working-tree changed set (reproduce-before-report phase 2a).
     */
    reviewReproduce: z.boolean().default(false),
    /**
     * When true (with reviewReproduce), run a fresh Cursor review session on remaining
     * gating blockers and DROP candidates without reproduce evidence (phase 2b).
     */
    reviewReproduceAgent: z.boolean().default(false),
    /**
     * Optional second-family review runtime (Cline). Unset = disabled (M3).
     * Runs after primary Cursor review (+ optional reproduce filters).
     */
    reviewSecondaryRuntime: z
      .enum([LOOP_RUNTIME_CLINE_PASS, LOOP_RUNTIME_CLINE])
      .optional(),
    /** Cline model for secondary review. Defaults per reviewSecondaryRuntime. */
    reviewSecondaryModel: z.string().optional(),
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
    if (config.verifyMode === 'skill' && !config.verifySkill) {
      ctx.addIssue({
        code: 'custom',
        message: 'verifySkill is required when verifyMode is "skill"',
        path: ['verifySkill'],
      })
    }
    try {
      validateLoopAgentConfig(config)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const issuePath = message.includes('escalateModel')
        ? ['escalateModel']
        : message.includes('reviewModel')
          ? ['reviewModel']
          : ['model']
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
      | 'reviewReproduce'
      | 'reviewReproduceAgent'
      | 'reviewSecondaryRuntime'
      | 'reviewSecondaryModel'
      | 'syncOnSuccess'
      | 'runtime'
      | 'model'
      | 'reviewModel'
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
  const cleanedOverrides = Object.fromEntries(
    Object.entries(overrides).filter(([, v]) => v !== undefined),
  ) as typeof overrides

  const nextRuntime = (cleanedOverrides.runtime ?? base.runtime) as LoopRuntime
  const previousRuntime = base.runtime as LoopRuntime

  const reconciled = clearIncompatibleAgentFieldsOnRuntimeSwitch({
    previousRuntime,
    nextRuntime,
    model: (cleanedOverrides.model ?? base.model) as string | undefined,
    escalateModel: (cleanedOverrides.escalateModel ?? base.escalateModel) as string | undefined,
    modelOverridden: cleanedOverrides.model !== undefined,
    escalateModelOverridden: cleanedOverrides.escalateModel !== undefined,
  })

  for (const warning of reconciled.warnings) {
    console.error(`[agent-loop] ${warning}`)
  }

  const merged: Record<string, unknown> = {
    ...base,
    ...cleanedOverrides,
  }

  if (reconciled.model === undefined) {
    delete merged.model
  } else {
    merged.model = reconciled.model
  }

  if (reconciled.escalateModel === undefined) {
    delete merged.escalateModel
  } else {
    merged.escalateModel = reconciled.escalateModel
  }

  return loopConfigSchema.parse(merged)
}

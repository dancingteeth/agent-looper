import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type RepoContext } from '../context/repoContext.js'
import { runAgentLoop, type AgentLoopResult } from './agentLoop.js'
import { loadLoopBundle } from './loopConfig.js'
import {
  createHitlCheckpoint,
  hitlLoopOverridesFrom,
} from '../integrations/hitlCheckpoint.js'
import { hitlProviderSchema } from '../integrations/hitlConfig.js'
import {
  hitlCheckDescriptionSchema,
  taskwarriorProjectSchema,
  runTaskwarriorSync,
} from '../integrations/taskwarrior.js'
import { logUsageSummary, mergeUsageSummaries } from '../usage/loopUsage.js'
import { resolveBatchDir, resolveBatchLoopDir } from './loopBatchPaths.js'
import { batchLoopConfig } from './loopBatchConfig.js'
import { migrateLegacySyncPostgres } from './loopConfigLegacy.js'
import { metaLoopConfigSchema, runMetaLoop } from './loopMeta.js'

export { metaLoopConfigSchema } from './loopMeta.js'
export type { MetaLoopConfig } from './loopMeta.js'

/** One fan-out target: legacy string path or `{ path, rubric }` object. */
export const batchLoopEntrySchema = z.union([
  z.string().min(1),
  z.object({
    path: z.string().min(1),
    /** Non-empty after trim — whitespace-only would silently no-op in the prompt. */
    rubric: z.string().trim().min(1),
  }),
])

export type BatchLoopEntry = z.infer<typeof batchLoopEntrySchema>

export function normalizeBatchLoopEntry(entry: BatchLoopEntry): { path: string; rubric?: string } {
  if (typeof entry === 'string') {
    return { path: entry }
  }
  return { path: entry.path, rubric: entry.rubric.trim() }
}

export const loopBatchConfigSchema = z
  .object({
    loops: z.array(batchLoopEntrySchema).optional(),
    metaLoop: metaLoopConfigSchema.optional(),
    hitlCheck: hitlCheckDescriptionSchema.optional(),
    taskwarriorProject: taskwarriorProjectSchema.optional(),
    hitlProvider: hitlProviderSchema.optional(),
    hitlFileDir: z.string().trim().min(1).optional(),
    hitlCommand: z.string().trim().min(1).optional(),
    hitlLinearTeam: z.string().trim().min(1).optional(),
    syncOnSuccess: z.boolean().default(true),
    /** Send completion report to Telegram when repo profile + env are configured. */
    notifyTelegram: z.boolean().default(true),
    /** Optional completion shell hook (overrides repo profile notifyCommand). */
    notifyCommand: z.string().trim().min(1).optional(),
    /** Attach review.md from each loop after the batch summary (when present). */
    telegramAttachReview: z.boolean().default(true),
    /** Open a HITL checkpoint when the batch ends incomplete. */
    hitlOnFailure: z.boolean().default(false),
    /** Abort before the batch if Telegram notify preflight fails. */
    requireNotify: z.boolean().default(false),
    /** Emit AGENT_LOOP_DONE on stdout when the batch CLI exits (default true). */
    completionSignal: z.boolean().default(true),
  })
  .superRefine((config, ctx) => {
    const hasLoops = (config.loops?.length ?? 0) > 0
    if (!hasLoops && !config.metaLoop) {
      ctx.addIssue({
        code: 'custom',
        message: 'loop-batch.json requires either loops[] or metaLoop',
        path: ['loops'],
      })
    }
    if (hasLoops && config.metaLoop) {
      ctx.addIssue({
        code: 'custom',
        message: 'loop-batch.json: use either loops[] or metaLoop, not both',
        path: ['metaLoop'],
      })
    }
  })

export type LoopBatchConfig = z.infer<typeof loopBatchConfigSchema>

export function parseLoopBatchConfig(raw: unknown): LoopBatchConfig {
  return loopBatchConfigSchema.parse(migrateLegacySyncPostgres(raw))
}

export type LoopBatchIteration = {
  loopDir: string
  result: AgentLoopResult
}

export type LoopBatchResult = {
  complete: boolean
  loopsRun: number
  iterations: LoopBatchIteration[]
  completionReason: string
  usage: ReturnType<typeof mergeUsageSummaries>
}

export function loadLoopBatchConfig(batchDir: string): LoopBatchConfig {
  const configPath = path.join(batchDir, 'loop-batch.json')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing loop-batch.json in ${batchDir}`)
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
  return parseLoopBatchConfig(raw)
}

export { resolveBatchDir, resolveBatchLoopDir } from './loopBatchPaths.js'

export type RunLoopBatchOptions = {
  ctx: RepoContext
  batchDir: string
  verbose?: boolean
  skipSync?: boolean
  onLoopStart?: (loopDir: string, index: number, total: number) => void
}

export async function runLoopBatch(options: RunLoopBatchOptions): Promise<LoopBatchResult> {
  const { ctx } = options
  const repoRoot = ctx.repoRoot
  const batchDir = resolveBatchDir(options.batchDir, repoRoot)
  const batchConfig = loadLoopBatchConfig(batchDir)

  if (batchConfig.metaLoop) {
    const metaResult = await runMetaLoop({
      ctx,
      batchDir,
      meta: batchConfig.metaLoop,
      verbose: options.verbose ?? false,
      batchLoopConfig,
    })

    if (metaResult.complete) {
      if (batchConfig.hitlCheck) {
        await createHitlCheckpoint({
          description: batchConfig.hitlCheck,
          reason: 'post_success',
          ctx,
          loopOverrides: hitlLoopOverridesFrom(batchConfig),
        })
      }
      const shouldSync = batchConfig.syncOnSuccess && !options.skipSync
      if (shouldSync && ctx.profile.syncCommand) {
        runTaskwarriorSync(ctx.profile.syncCommand, repoRoot)
      } else if (shouldSync) {
        console.error('[agent-loop] batch sync skipped — no syncCommand in repo profile')
      }
    }

    logUsageSummary('agent-loop-batch', metaResult.usage)

    const probeDir = resolveBatchLoopDir(batchConfig.metaLoop.probe, batchDir, repoRoot)
    const fixDir = resolveBatchLoopDir(batchConfig.metaLoop.fix, batchDir, repoRoot)
    const iterations: LoopBatchIteration[] = []
    const lastCycle = metaResult.cycles[metaResult.cycles.length - 1]
    if (lastCycle) {
      iterations.push({ loopDir: probeDir, result: lastCycle.probe })
      if (lastCycle.fix) {
        iterations.push({ loopDir: fixDir, result: lastCycle.fix })
      }
    }

    return {
      complete: metaResult.complete,
      loopsRun: metaResult.cyclesRun,
      iterations,
      completionReason: metaResult.completionReason,
      usage: metaResult.usage,
    }
  }

  const loops = batchConfig.loops ?? []
  const iterations: LoopBatchIteration[] = []

  for (let i = 0; i < loops.length; i++) {
    const { path: loopPath, rubric: batchRubric } = normalizeBatchLoopEntry(loops[i]!)
    const loopDir = resolveBatchLoopDir(loopPath, batchDir, repoRoot)
    options.onLoopStart?.(loopDir, i + 1, loops.length)

    const bundle = loadLoopBundle(loopDir)
    const result = await runAgentLoop({
      ctx,
      bundle: { ...bundle, config: batchLoopConfig(bundle.config) },
      verbose: options.verbose ?? false,
      ...(batchRubric ? { batchRubric } : {}),
    })

    iterations.push({ loopDir, result })

    if (!result.complete) {
      const usage = mergeUsageSummaries(...iterations.map((entry) => entry.result.usage))
      logUsageSummary('agent-loop-batch', usage)
      return {
        complete: false,
        loopsRun: i + 1,
        iterations,
        completionReason: `Loop ${i + 1}/${loops.length} failed: ${result.completionReason}`,
        usage,
      }
    }
  }

  if (batchConfig.hitlCheck) {
    await createHitlCheckpoint({
      description: batchConfig.hitlCheck,
      reason: 'post_success',
      ctx,
      loopOverrides: hitlLoopOverridesFrom(batchConfig),
    })
  }

  const shouldSync = batchConfig.syncOnSuccess && !options.skipSync
  if (shouldSync && ctx.profile.syncCommand) {
    runTaskwarriorSync(ctx.profile.syncCommand, repoRoot)
  } else if (shouldSync) {
    console.error('[agent-loop] batch sync skipped — no syncCommand in repo profile')
  }

  const usage = mergeUsageSummaries(...iterations.map((entry) => entry.result.usage))
  logUsageSummary('agent-loop-batch', usage)

  return {
    complete: true,
    loopsRun: loops.length,
    iterations,
    completionReason: `All ${loops.length} loops passed.`,
    usage,
  }
}

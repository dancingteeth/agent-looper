import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { resolveTaskwarriorProject, type RepoContext } from '../context/repoContext.js'
import { runAgentLoop, type AgentLoopResult } from './agentLoop.js'
import { loadLoopBundle, mergeLoopConfig, type LoopConfig } from './loopConfig.js'
import {
  createHitlCheckTask,
  hitlCheckDescriptionSchema,
  runTaskwarriorSync,
} from '../integrations/taskwarrior.js'

export const loopBatchConfigSchema = z.object({
  loops: z.array(z.string().min(1)).min(1),
  hitlCheck: hitlCheckDescriptionSchema.optional(),
  taskwarriorProject: z.string().trim().min(1).optional(),
  syncOnSuccess: z.boolean().default(true),
})

export type LoopBatchConfig = z.infer<typeof loopBatchConfigSchema>

export function parseLoopBatchConfig(raw: unknown): LoopBatchConfig {
  if (typeof raw === 'object' && raw !== null && 'syncPostgres' in raw) {
    const record = raw as Record<string, unknown>
    const { syncPostgres, ...rest } = record
    if (typeof syncPostgres === 'boolean' && !('syncOnSuccess' in rest)) {
      return loopBatchConfigSchema.parse({ ...rest, syncOnSuccess: syncPostgres })
    }
  }
  return loopBatchConfigSchema.parse(raw)
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
}

export function resolveBatchDir(batchDirArg: string, repoRoot: string): string {
  const resolved = path.isAbsolute(batchDirArg) ? batchDirArg : path.join(repoRoot, batchDirArg)
  return path.resolve(resolved)
}

export function loadLoopBatchConfig(batchDir: string): LoopBatchConfig {
  const configPath = path.join(batchDir, 'loop-batch.json')
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing loop-batch.json in ${batchDir}`)
  }
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8')) as unknown
  return parseLoopBatchConfig(raw)
}

export function resolveBatchLoopDir(loopEntry: string, batchDir: string, repoRoot: string): string {
  if (path.isAbsolute(loopEntry)) {
    return path.resolve(loopEntry)
  }
  if (loopEntry.startsWith('.cursor/') || loopEntry.startsWith('src/')) {
    return path.resolve(repoRoot, loopEntry)
  }
  const loopsRoot = path.resolve(batchDir, '..')
  return path.resolve(loopsRoot, loopEntry)
}

export type RunLoopBatchOptions = {
  ctx: RepoContext
  batchDir: string
  verbose?: boolean
  skipSync?: boolean
  onLoopStart?: (loopDir: string, index: number, total: number) => void
}

function batchLoopConfig(base: LoopConfig): LoopConfig {
  const { hitlCheck: _omit, ...rest } = base
  return mergeLoopConfig(rest, { syncOnSuccess: false })
}

export async function runLoopBatch(options: RunLoopBatchOptions): Promise<LoopBatchResult> {
  const { ctx } = options
  const repoRoot = ctx.repoRoot
  const batchDir = resolveBatchDir(options.batchDir, repoRoot)
  const batchConfig = loadLoopBatchConfig(batchDir)
  const twProject = resolveTaskwarriorProject(batchConfig.taskwarriorProject, ctx.profile)
  const iterations: LoopBatchIteration[] = []

  for (let i = 0; i < batchConfig.loops.length; i++) {
    const loopEntry = batchConfig.loops[i]!
    const loopDir = resolveBatchLoopDir(loopEntry, batchDir, repoRoot)
    options.onLoopStart?.(loopDir, i + 1, batchConfig.loops.length)

    const bundle = loadLoopBundle(loopDir)
    const result = await runAgentLoop({
      ctx,
      bundle: { ...bundle, config: batchLoopConfig(bundle.config) },
      verbose: options.verbose ?? false,
    })

    iterations.push({ loopDir, result })

    if (!result.complete) {
      return {
        complete: false,
        loopsRun: i + 1,
        iterations,
        completionReason: `Loop ${i + 1}/${batchConfig.loops.length} failed: ${result.completionReason}`,
      }
    }
  }

  if (batchConfig.hitlCheck) {
    createHitlCheckTask(batchConfig.hitlCheck, twProject)
  }

  const shouldSync = batchConfig.syncOnSuccess && !options.skipSync
  if (shouldSync && ctx.profile.syncCommand) {
    runTaskwarriorSync(ctx.profile.syncCommand, repoRoot)
  } else if (shouldSync) {
    console.error('[agent-loop] batch sync skipped — no syncCommand in repo profile')
  }

  return {
    complete: true,
    loopsRun: batchConfig.loops.length,
    iterations,
    completionReason: `All ${batchConfig.loops.length} loops passed.`,
  }
}

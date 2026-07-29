import type { RepoContext } from '../context/repoContext.js'
import { z } from 'zod'
import { runAgentLoop, type AgentLoopResult } from './agentLoop.js'
import { loadLoopBundle, mergeLoopConfig, type LoopConfig } from './loopConfig.js'
import { clearFailureContext, writeFailureContext } from './loopFailureContext.js'
import { logFailureDomainFromVerify } from './loopFailureDomain.js'
import { resolveBatchLoopDir } from './loopBatchPaths.js'
import { mergeUsageSummaries } from '../usage/loopUsage.js'

export const metaLoopConfigSchema = z.object({
  probe: z.string().min(1),
  fix: z.string().min(1),
  maxCycles: z.number().int().min(1).max(10).default(3),
})

export type MetaLoopConfig = z.infer<typeof metaLoopConfigSchema>

export type MetaLoopCycleResult = {
  cycle: number
  probe: AgentLoopResult
  fix?: AgentLoopResult
}

export type MetaLoopResult = {
  complete: boolean
  cyclesRun: number
  cycles: MetaLoopCycleResult[]
  completionReason: string
  usage: ReturnType<typeof mergeUsageSummaries>
}

export type RunMetaLoopOptions = {
  ctx: RepoContext
  batchDir: string
  meta: MetaLoopConfig
  verbose?: boolean
  batchLoopConfig: (base: LoopConfig) => LoopConfig
}

export { batchLoopConfig as metaBatchLoopConfig } from './loopBatchConfig.js'

export async function runMetaLoop(options: RunMetaLoopOptions): Promise<MetaLoopResult> {
  const { ctx, batchDir, meta, verbose = false } = options
  const repoRoot = ctx.repoRoot
  const probeDir = resolveBatchLoopDir(meta.probe, batchDir, repoRoot)
  const fixDir = resolveBatchLoopDir(meta.fix, batchDir, repoRoot)
  const cycles: MetaLoopCycleResult[] = []
  let usage = mergeUsageSummaries()

  console.error(
    `[agent-loop-meta] probe=${meta.probe} fix=${meta.fix} maxCycles=${meta.maxCycles}`,
  )

  for (let cycle = 1; cycle <= meta.maxCycles; cycle++) {
    clearFailureContext(fixDir)
    console.error(`[agent-loop-meta] cycle ${cycle}/${meta.maxCycles} — running probe`)

    const probeBundle = loadLoopBundle(probeDir)
    const probeResult = await runAgentLoop({
      ctx,
      bundle: {
        ...probeBundle,
        config: options.batchLoopConfig(probeBundle.config),
      },
      verbose,
    })
    usage = mergeUsageSummaries(usage, probeResult.usage)

    if (probeResult.complete) {
      return {
        complete: true,
        cyclesRun: cycle,
        cycles: [...cycles, { cycle, probe: probeResult }],
        completionReason: `Probe passed on cycle ${cycle}: ${probeResult.completionReason}`,
        usage,
      }
    }

    writeFailureContext(fixDir, {
      probeLoopDir: meta.probe,
      probeResult,
      cycle,
      maxCycles: meta.maxCycles,
    })

    if (probeResult.lastVerify) {
      logFailureDomainFromVerify(probeDir, {
        iteration: probeResult.iterations,
        reason: 'meta_probe_failed',
        verify: probeResult.lastVerify,
      })
    }

    console.error(`[agent-loop-meta] cycle ${cycle}/${meta.maxCycles} — probe failed, running fix`)

    const fixBundle = loadLoopBundle(fixDir)
    const fixResult = await runAgentLoop({
      ctx,
      bundle: {
        ...fixBundle,
        config: mergeLoopConfig(options.batchLoopConfig(fixBundle.config), {
          injectFailureContext: true,
        }),
      },
      verbose,
    })
    usage = mergeUsageSummaries(usage, fixResult.usage)
    cycles.push({ cycle, probe: probeResult, fix: fixResult })

    if (!fixResult.complete) {
      return {
        complete: false,
        cyclesRun: cycle,
        cycles,
        completionReason: `Fix loop failed on cycle ${cycle}: ${fixResult.completionReason}`,
        usage,
      }
    }
  }

  return {
    complete: false,
    cyclesRun: meta.maxCycles,
    cycles,
    completionReason: `Meta-loop exhausted ${meta.maxCycles} probe→fix cycles without probe passing.`,
    usage,
  }
}


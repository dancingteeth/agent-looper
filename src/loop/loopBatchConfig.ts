import { mergeLoopConfig, type LoopConfig } from './loopConfig.js'

/** Batch/meta runs disable per-loop sync and HITL — batch handles those once at the end. */
export function batchLoopConfig(base: LoopConfig): LoopConfig {
  const { hitlCheck: _omit, ...rest } = base
  return mergeLoopConfig(rest, { syncOnSuccess: false })
}

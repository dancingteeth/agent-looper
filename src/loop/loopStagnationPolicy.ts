import type { LoopConfig } from './loopConfig.js'

export type StagnationPolicy = {
  promptRepeatCount: number | undefined
  escalationRepeatCount: number | undefined
}

export function resolveStagnationPolicy(
  config: LoopConfig,
  repeatCount: number,
): StagnationPolicy {
  if (config.stagnationThreshold <= 0 || repeatCount < 1) {
    return { promptRepeatCount: undefined, escalationRepeatCount: undefined }
  }

  const escalateThreshold = config.escalateAfterStagnation ?? 2
  return {
    promptRepeatCount: repeatCount >= 2 ? repeatCount : undefined,
    escalationRepeatCount: repeatCount >= escalateThreshold ? repeatCount : undefined,
  }
}

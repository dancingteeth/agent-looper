import type { LoopConfig } from './loopConfig.js'

export type StagnationPolicy = {
  promptRepeatCount: number | undefined
  escalationRepeatCount: number | undefined
  probeRepeatCount: number | undefined
}

export function resolveStagnationPolicy(
  config: LoopConfig,
  repeatCount: number,
  probesUsed?: boolean,
): StagnationPolicy {
  const empty = {
    promptRepeatCount: undefined as number | undefined,
    escalationRepeatCount: undefined as number | undefined,
    probeRepeatCount: undefined as number | undefined,
  }
  if (config.stagnationThreshold <= 0 || repeatCount < 1) {
    return empty
  }

  const escalateThreshold = config.escalateAfterStagnation ?? 2
  const promptRepeatCount = repeatCount >= 2 ? repeatCount : undefined

  if (config.stallProbes && !probesUsed && repeatCount >= escalateThreshold) {
    return {
      promptRepeatCount,
      escalationRepeatCount: undefined,
      probeRepeatCount: repeatCount,
    }
  }

  if (config.stallProbes && probesUsed && repeatCount >= escalateThreshold) {
    return {
      promptRepeatCount,
      escalationRepeatCount: repeatCount,
      probeRepeatCount: undefined,
    }
  }

  return {
    promptRepeatCount,
    escalationRepeatCount: repeatCount >= escalateThreshold ? repeatCount : undefined,
    probeRepeatCount: undefined,
  }
}

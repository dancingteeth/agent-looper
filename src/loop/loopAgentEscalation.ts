import type { LoopConfig } from './loopConfig.js'
import { assertLoopModelAllowed } from '../usage/modelPolicy.js'
import { LOOP_RUNTIME_CURSOR, type LoopReasoningEffort } from './modelCatalog.js'
import { runtimeHonorsReasoningEffort } from './runtimeSpec.js'
import { resolveLoopAgent, type ResolvedLoopAgent } from './loopAgentConfig.js'

/** Ordered reasoning tiers used for gradual escalation (excludes 'none'). */
const REASONING_LADDER = ['low', 'medium', 'high', 'xhigh'] as const
type ReasoningLadderTier = (typeof REASONING_LADDER)[number]

function ladderIndex(effort: LoopReasoningEffort | undefined): number {
  if (effort === undefined || effort === 'none') return -1
  return (REASONING_LADDER as readonly string[]).indexOf(effort)
}

/**
 * Resolve the reasoning tier for a given iteration by stepping up the ladder from the
 * base tier toward the ceiling. Steps once per iteration (after iteration 1) by
 * `step` tiers, capped at the ceiling. Driven by iteration count — not by identical
 * failure signature — so it climbs reliably even when cranking effort changes the
 * agent's approach (and thus the verifier output).
 */
function resolveReasoningTier(
  base: LoopReasoningEffort | undefined,
  ceiling: LoopReasoningEffort | undefined,
  step: number,
  iteration: number,
  /**
   * Extra reasoning-tier steps for BLOCKERS-driven fix rounds. Added on top of the
   * iteration-climb below, so a fix round can jump up to `step` extra tiers at once
   * (e.g. iteration 2 + 1 fix round = +2). Bounded by the ceiling.
   */
  reviewCycleEscalation = 0,
): LoopReasoningEffort | undefined {
  const baseIdx = ladderIndex(base)
  if (baseIdx < 0) return base
  const ceilIdx = ladderIndex(ceiling) < 0 ? baseIdx : ladderIndex(ceiling)
  // Iteration climb + review-cycle fix-round steps compound; a fix round may jump
  // multiple tiers at once, capped by the ceiling.
  const ticks = Math.max(0, iteration - 1) + Math.max(0, reviewCycleEscalation)
  const idx = Math.min(ceilIdx, baseIdx + step * ticks)
  return REASONING_LADDER[idx] as ReasoningLadderTier
}

export function resolveIterationAgent(
  config: LoopConfig,
  iteration: number,
  escalationRepeatCount: number | undefined,
  reviewCycleEscalation = 0,
  escalateForWorkerFault = false,
): ResolvedLoopAgent {
  const base = resolveLoopAgent(config)
  if (base.runtime === LOOP_RUNTIME_CURSOR) {
    return base
  }

  if (runtimeHonorsReasoningEffort(base.runtime)) {
    const step = config.reasoningEscalationStep ?? 1
    const tier = resolveReasoningTier(
      config.reasoningEffort,
      config.escalateReasoningEffort,
      step,
      iteration,
      reviewCycleEscalation,
    )

    let agent: ResolvedLoopAgent = { ...base, reasoningEffort: tier }

    // Model switch (expensive lever) is sequenced AFTER the cheap lever is exhausted:
    // only once reasoning has reached its ceiling AND hard stagnation (identical
    // consecutive verifier failures) persists past the threshold. When no reasoning
    // ladder is configured, model escalation keeps its prior stagnation-gated behavior.
    // A hung/timed-out worker skips that gate — repeating the same dead model is
    // not a reasoning problem.
    const reasoningConfigured =
      config.reasoningEffort !== undefined && config.reasoningEffort !== 'none'
    const atCeiling =
      !reasoningConfigured || tier === (config.escalateReasoningEffort ?? tier)
    const threshold = config.escalateAfterStagnation ?? 2
    const switchForStagnation =
      atCeiling &&
      escalationRepeatCount !== undefined &&
      escalationRepeatCount >= threshold

    if (config.escalateModel && (escalateForWorkerFault || switchForStagnation)) {
      assertLoopModelAllowed(base.runtime, config.escalateModel)
      const reasoningEffort = config.escalateModelReasoningEffort ?? tier
      agent = {
        ...resolveLoopAgent({ ...config, model: config.escalateModel }),
        reasoningEffort,
      }
    }

    return agent
  }

  const threshold = config.escalateAfterStagnation ?? 2
  const switchModel =
    config.escalateModel &&
    (escalateForWorkerFault ||
      (escalationRepeatCount !== undefined && escalationRepeatCount >= threshold))
      ? config.escalateModel
      : undefined
  if (switchModel) {
    assertLoopModelAllowed(base.runtime, switchModel)
    return resolveLoopAgent({ ...config, model: switchModel })
  }
  return base
}

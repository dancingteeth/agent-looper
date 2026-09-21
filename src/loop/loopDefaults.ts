/**
 * Repo-wide loop defaults (`.cursor/agent-loop.repo.json` → `defaults`)
 * vs per-loop `loop.json`. loop.json wins on conflict.
 *
 * Keep verify / GOAL-link fields out of defaults — those are the scoreboard
 * for one bundle, not a repo profile.
 */

import {
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_VALUES,
  type LoopRuntime,
} from './modelCatalog.js'
import {
  defaultModelForRuntime,
  defaultReviewModel,
  modelCompatibleWithRuntime,
  reviewModelCompatibleWithRuntime,
} from './runtimeSpec.js'

/** Keys that stay in loop.json only (never copied into profile.defaults). */
export const LOOP_JSON_ONLY_KEYS = [
  'verify',
  'verifyMode',
  'verifySkill',
  'finalVerify',
  'taskwarriorUuid',
] as const

const LOOP_JSON_ONLY = new Set<string>(LOOP_JSON_ONLY_KEYS)

export function isLoopJsonOnlyKey(key: string): boolean {
  return LOOP_JSON_ONLY.has(key)
}

/** Drop per-loop-only keys and undefined values from a loop-shaped object. */
export function pickLoopDefaults(config: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (value === undefined) continue
    if (isLoopJsonOnlyKey(key)) continue
    defaults[key] = value
  }
  return defaults
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwnKey(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function asLoopRuntime(value: unknown): LoopRuntime | undefined {
  if (typeof value !== 'string') return undefined
  return (LOOP_RUNTIME_VALUES as readonly string[]).includes(value)
    ? (value as LoopRuntime)
    : undefined
}

function winningRuntime(
  merged: Record<string, unknown>,
  key: 'runtime' | 'reviewRuntime' | 'reviewSecondaryRuntime',
  fallback?: LoopRuntime,
): LoopRuntime | undefined {
  return asLoopRuntime(merged[key]) ?? fallback
}

/**
 * Drop repo-default model slugs that do not match the winning runtime, and
 * replace worker/judge slugs with that runtime's default so `costPreset`
 * does not re-resolve minmax after the overlay.
 *
 * Explicit loop.json keys are left for parse to reject.
 */
export function reconcileLoopDefaults(
  loopJson: unknown,
  defaults: Record<string, unknown> | undefined,
): { merged: unknown; warnings: string[] } {
  if (!defaults || Object.keys(defaults).length === 0) {
    return { merged: loopJson, warnings: [] }
  }
  if (!isPlainObject(loopJson)) {
    return { merged: loopJson, warnings: [] }
  }

  const merged: Record<string, unknown> = { ...defaults, ...loopJson }
  const warnings: string[] = []
  const workerRuntime = winningRuntime(merged, 'runtime', LOOP_RUNTIME_CURSOR)
  if (workerRuntime === undefined) {
    return { merged, warnings }
  }

  const model = merged.model
  if (
    !hasOwnKey(loopJson, 'model') &&
    typeof model === 'string' &&
    !modelCompatibleWithRuntime(workerRuntime, model)
  ) {
    const next = defaultModelForRuntime(workerRuntime)
    warnings.push(
      `cleared model "${model}" from repo defaults — not valid for runtime "${workerRuntime}"; using "${next}".`,
    )
    merged.model = next
  }

  const escalateModel = merged.escalateModel
  if (
    !hasOwnKey(loopJson, 'escalateModel') &&
    typeof escalateModel === 'string' &&
    !modelCompatibleWithRuntime(workerRuntime, escalateModel)
  ) {
    let warning =
      `cleared escalateModel "${escalateModel}" from repo defaults — not valid for runtime "${workerRuntime}".`
    if (workerRuntime === LOOP_RUNTIME_CURSOR) {
      warning +=
        ' Omit escalateModel on Cursor; use reviewRuntime + reviewModel for a non-Cursor judge.'
    }
    warnings.push(warning)
    delete merged.escalateModel
  }

  const reviewRuntime = winningRuntime(merged, 'reviewRuntime', LOOP_RUNTIME_CURSOR)
  if (reviewRuntime !== undefined) {
    const reviewModel = merged.reviewModel
    if (
      !hasOwnKey(loopJson, 'reviewModel') &&
      typeof reviewModel === 'string' &&
      !reviewModelCompatibleWithRuntime(reviewRuntime, reviewModel)
    ) {
      const next = defaultReviewModel(reviewRuntime, workerRuntime)
      warnings.push(
        `cleared reviewModel "${reviewModel}" from repo defaults — not valid for reviewRuntime "${reviewRuntime}"; using "${next}".`,
      )
      merged.reviewModel = next
    }
  }

  const secondaryRuntime = winningRuntime(merged, 'reviewSecondaryRuntime')
  if (secondaryRuntime !== undefined) {
    const secondaryModel = merged.reviewSecondaryModel
    if (
      !hasOwnKey(loopJson, 'reviewSecondaryModel') &&
      typeof secondaryModel === 'string' &&
      !reviewModelCompatibleWithRuntime(secondaryRuntime, secondaryModel)
    ) {
      const next = defaultReviewModel(secondaryRuntime, workerRuntime)
      warnings.push(
        `cleared reviewSecondaryModel "${secondaryModel}" from repo defaults — not valid for reviewSecondaryRuntime "${secondaryRuntime}"; using "${next}".`,
      )
      merged.reviewSecondaryModel = next
    }
  }

  return { merged, warnings }
}

/**
 * Overlay repo defaults under loop.json. Explicit loop.json keys win,
 * including `null` / empty string when the user set them.
 */
export function applyLoopDefaults(
  loopJson: unknown,
  defaults: Record<string, unknown> | undefined,
): unknown {
  const { merged, warnings } = reconcileLoopDefaults(loopJson, defaults)
  for (const warning of warnings) {
    console.error(`[agent-loop] ${warning}`)
  }
  return merged
}

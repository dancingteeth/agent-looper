/**
 * Repo-wide loop defaults (`.cursor/agent-loop.repo.json` → `defaults`)
 * vs per-loop `loop.json`. loop.json wins on conflict.
 *
 * Keep verify / GOAL-link fields out of defaults — those are the scoreboard
 * for one bundle, not a repo profile.
 */

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

/**
 * Overlay repo defaults under loop.json. Explicit loop.json keys win,
 * including `null` / empty string when the user set them.
 */
export function applyLoopDefaults(
  loopJson: unknown,
  defaults: Record<string, unknown> | undefined,
): unknown {
  if (!defaults || Object.keys(defaults).length === 0) return loopJson
  if (typeof loopJson !== 'object' || loopJson === null || Array.isArray(loopJson)) {
    return loopJson
  }
  return { ...defaults, ...loopJson }
}

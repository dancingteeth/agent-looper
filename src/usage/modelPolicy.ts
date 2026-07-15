import {
  CURSOR_LOOP_MODEL,
  isClineSdkRuntime,
  LOOP_RUNTIME_CURSOR,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'

/** Expensive / disallowed Cursor models for loop runs (reviews included). */
export const BANNED_CURSOR_LOOP_MODELS = new Set([
  'composer-2.5-fast',
  'composer-fast',
  'composer-2-fast',
])

export function isBannedCursorLoopModel(model: string): boolean {
  return BANNED_CURSOR_LOOP_MODELS.has(model.toLowerCase())
}

export function assertLoopModelAllowed(runtime: LoopRuntime, model: string): void {
  if (runtime === LOOP_RUNTIME_CURSOR) {
    if (isBannedCursorLoopModel(model)) {
      throw new Error(
        `Model "${model}" is banned for agent loops — use "${CURSOR_LOOP_MODEL}" (not Composer Fast).`,
      )
    }
    if (model !== CURSOR_LOOP_MODEL) {
      throw new Error(
        `loop.json model must be "${CURSOR_LOOP_MODEL}" for runtime "cursor" (got "${model}")`,
      )
    }
    return
  }

  if (isClineSdkRuntime(runtime) && isBannedCursorLoopModel(model)) {
    throw new Error(
      `Model "${model}" looks like Composer Fast — not allowed in loops.`,
    )
  }
}

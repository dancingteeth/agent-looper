import {
  CURSOR_REVIEW_MODELS,
  CURSOR_WORKER_MODEL,
  isClineSdkRuntime,
  isCodexRuntime,
  isCursorSdkModel,
  isDshRuntime,
  isMuseRuntime,
  isOpencodeRuntime,
  isPiRuntime,
  LOOP_RUNTIME_CURSOR,
  type LoopRuntime,
} from '../loop/loopAgentConfig.js'

/** Expensive / disallowed Cursor models for loop runs (reviews included). */
export const BANNED_CURSOR_LOOP_MODELS = new Set([
  'composer-2.5-fast',
  'composer-fast',
  'composer-2-fast',
  'grok-4.5-fast',
  'grok-4.6-fast',
  'grok-fast',
])

export function isBannedCursorLoopModel(model: string): boolean {
  return BANNED_CURSOR_LOOP_MODELS.has(model.toLowerCase())
}

/** Worker implement iterations on runtime "cursor" — Composer standard only. */
export function assertLoopModelAllowed(runtime: LoopRuntime, model: string): void {
  if (runtime === LOOP_RUNTIME_CURSOR) {
    if (isBannedCursorLoopModel(model)) {
      throw new Error(
        `Model "${model}" is banned for agent loops — use "${CURSOR_WORKER_MODEL}" (not Fast).`,
      )
    }
    if (model !== CURSOR_WORKER_MODEL) {
      throw new Error(
        `loop.json model (worker) must be "${CURSOR_WORKER_MODEL}" for runtime "cursor" (got "${model}"). ` +
          `Use reviewModel for the judge (default "${CURSOR_REVIEW_MODELS[0]}").`,
      )
    }
    return
  }

  if (
    (isClineSdkRuntime(runtime) ||
      isOpencodeRuntime(runtime) ||
      isPiRuntime(runtime) ||
      isCodexRuntime(runtime) ||
      isDshRuntime(runtime) ||
      isMuseRuntime(runtime)) &&
    isBannedCursorLoopModel(model)
  ) {
    throw new Error(
      `Model "${model}" looks like a Fast variant — not allowed in loops.`,
    )
  }
}

/** Any Cursor SDK model used by the harness (worker or review). */
export function assertCursorSdkModelAllowed(
  model: string,
  role: 'worker' | 'review' = 'worker',
): void {
  if (isBannedCursorLoopModel(model)) {
    throw new Error(
      `Model "${model}" is banned for Cursor SDK ${role} runs — use standard (non-Fast) ids.`,
    )
  }
  if (role === 'worker' && model !== CURSOR_WORKER_MODEL) {
    throw new Error(
      `Cursor worker model must be "${CURSOR_WORKER_MODEL}" (got "${model}")`,
    )
  }
  if (role === 'review' && !isCursorSdkModel(model)) {
    throw new Error(
      `Cursor review model must be one of ${CURSOR_REVIEW_MODELS.join(', ')} (got "${model}")`,
    )
  }
}

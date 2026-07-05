import { z } from 'zod'

export const LOOP_MODE_FORWARD = 'forward' as const
export const LOOP_MODE_REVERSE = 'reverse' as const

export const loopModeSchema = z
  .enum([LOOP_MODE_FORWARD, LOOP_MODE_REVERSE])
  .default(LOOP_MODE_FORWARD)

export type LoopMode = z.infer<typeof loopModeSchema>

export function buildReverseModePromptSection(): string {
  return `## Reverse mode (clean-room)

You are in **reverse Ralph** mode — rebuild toward the goal without leaning on the existing implementation.

1. Read **tests, specs, public API surfaces, and GOAL.md** only — do not study or copy existing implementation internals.
2. Prefer a **minimal correct solution** over patching legacy code.
3. You may replace implementation files entirely if tests and the goal allow it.
4. Do **not** expand scope beyond the goal.

`
}

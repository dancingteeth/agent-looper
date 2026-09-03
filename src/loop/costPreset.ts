import { z } from 'zod'
import {
  isRuntimeDetected,
  type DetectableRuntime,
  type DetectionResult,
} from '../cli/detectRuntimes.js'
import {
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_LOOP_MODEL,
  DEFAULT_CODEX_ESCALATE_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_ESCALATE_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  LOOP_RUNTIME_VALUES,
  type LoopRuntime,
} from './loopAgentConfig.js'

export const COST_PRESET_VALUES = ['minmax', 'balanced', 'cursor'] as const
export type CostPreset = (typeof COST_PRESET_VALUES)[number]

/** Reserved name — cannot be used as a user `costPresets` key. */
export const COST_PRESET_CUSTOM = 'custom'

/** Built-in + setup-only names cannot be shadowed by a user `costPresets` entry. */
export const RESERVED_COST_PRESET_NAMES = [...COST_PRESET_VALUES, COST_PRESET_CUSTOM] as const

export function isReservedCostPresetName(name: string): boolean {
  return (RESERVED_COST_PRESET_NAMES as readonly string[]).includes(name)
}

/** User catalog names: kebab-case, not a built-in / setup-only reserved word. */
export const USER_COST_PRESET_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/

export function assertUserCostPresetName(name: string): void {
  if (isReservedCostPresetName(name)) {
    throw new Error(
      `costPreset name "${name}" is reserved (minmax, balanced, cursor, custom)`,
    )
  }
  if (!USER_COST_PRESET_NAME_RE.test(name)) {
    throw new Error(
      `costPreset name "${name}" must be a kebab-case slug (e.g. hy3-dsh)`,
    )
  }
}

export function isCostPreset(value: string): value is CostPreset {
  return (COST_PRESET_VALUES as readonly string[]).includes(value)
}

/** User-authored stacks from the repo profile `costPresets` map (name → stack). */
export type UserCostPresetMap = Record<string, unknown>

export const costPresetStackSchema = z.object({
  runtime: z.enum(LOOP_RUNTIME_VALUES),
  model: z.string().trim().min(1),
  reviewRuntime: z.enum(LOOP_RUNTIME_VALUES),
  reviewModel: z.string().trim().min(1),
  escalateModel: z.string().trim().min(1).optional(),
})

export type CostPresetStack = z.infer<typeof costPresetStackSchema>

export const userCostPresetsCatalogSchema = z
  .record(z.string(), costPresetStackSchema)
  .superRefine((map, ctx) => {
    for (const name of Object.keys(map)) {
      if (isReservedCostPresetName(name)) {
        ctx.addIssue({
          code: 'custom',
          message: `costPreset name "${name}" is reserved (built-in) and cannot be defined in profile costPresets`,
          path: [name],
        })
        continue
      }
      if (!USER_COST_PRESET_NAME_RE.test(name)) {
        ctx.addIssue({
          code: 'custom',
          message: `costPreset name "${name}" must be a kebab-case slug (e.g. hy3-dsh)`,
          path: [name],
        })
      }
    }
  })

export function parseCostPresetsCatalog(raw: unknown): UserCostPresetMap {
  const parsed = userCostPresetsCatalogSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'invalid costPresets catalog')
  }
  return parsed.data
}

type WorkerRow = {
  probe: DetectableRuntime
  runtime: LoopRuntime
  minmaxModel: string
  balancedModel: string
  escalateModel?: string
}

type JudgeRow = {
  probe: DetectableRuntime
  runtime: LoopRuntime
  model: string
}

const WORKER_LADDER: readonly WorkerRow[] = [
  {
    probe: 'opencode',
    runtime: LOOP_RUNTIME_OPENCODE,
    minmaxModel: 'opencode-go/hy3',
    balancedModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
    escalateModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  },
  {
    probe: 'cline',
    runtime: LOOP_RUNTIME_CLINE_PASS,
    minmaxModel: DEFAULT_CLINE_PASS_LOOP_MODEL,
    balancedModel: DEFAULT_CLINE_PASS_ESCALATE_MODEL,
    escalateModel: DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  },
  {
    probe: 'dsh',
    runtime: LOOP_RUNTIME_DSH,
    minmaxModel: DEFAULT_DSH_LOOP_MODEL,
    balancedModel: DEFAULT_DSH_ESCALATE_MODEL,
    escalateModel: DEFAULT_DSH_ESCALATE_MODEL,
  },
  {
    probe: 'pi',
    runtime: LOOP_RUNTIME_PI,
    minmaxModel: DEFAULT_PI_LOOP_MODEL,
    balancedModel: DEFAULT_PI_ESCALATE_MODEL,
    escalateModel: DEFAULT_PI_ESCALATE_MODEL,
  },
  {
    probe: 'codex',
    runtime: LOOP_RUNTIME_CODEX,
    minmaxModel: DEFAULT_CODEX_LOOP_MODEL,
    balancedModel: DEFAULT_CODEX_ESCALATE_MODEL,
    escalateModel: DEFAULT_CODEX_ESCALATE_MODEL,
  },
  {
    probe: 'cursor',
    runtime: LOOP_RUNTIME_CURSOR,
    minmaxModel: CURSOR_LOOP_MODEL,
    balancedModel: CURSOR_LOOP_MODEL,
  },
]

const JUDGE_LADDER: readonly JudgeRow[] = [
  { probe: 'cursor', runtime: LOOP_RUNTIME_CURSOR, model: CURSOR_REVIEW_MODEL },
  { probe: 'dsh', runtime: LOOP_RUNTIME_DSH, model: DEFAULT_DSH_REVIEW_MODEL },
  {
    probe: 'opencode',
    runtime: LOOP_RUNTIME_OPENCODE,
    model: DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  },
  { probe: 'codex', runtime: LOOP_RUNTIME_CODEX, model: DEFAULT_CODEX_REVIEW_MODEL },
  {
    probe: 'cline',
    runtime: LOOP_RUNTIME_CLINE_PASS,
    model: DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  },
  { probe: 'pi', runtime: LOOP_RUNTIME_PI, model: DEFAULT_PI_ESCALATE_MODEL },
]

export function shortModelName(slug: string): string {
  const slash = slug.lastIndexOf('/')
  return slash === -1 ? slug : slug.slice(slash + 1)
}

function pickWorker(
  preset: 'minmax' | 'balanced',
  detection: DetectionResult,
): Pick<CostPresetStack, 'runtime' | 'model' | 'escalateModel'> {
  for (const row of WORKER_LADDER) {
    if (!isRuntimeDetected(detection, row.probe)) continue
    const model = preset === 'minmax' ? row.minmaxModel : row.balancedModel
    return {
      runtime: row.runtime,
      model,
      escalateModel: row.escalateModel,
    }
  }
  throw new Error(
    `costPreset "${preset}" needs a worker runtime. Install Cursor, OpenCode, Cline, DSH, Pi, or Codex — or pick custom.`,
  )
}

function pickJudge(
  workerRuntime: LoopRuntime,
  detection: DetectionResult,
): Pick<CostPresetStack, 'reviewRuntime' | 'reviewModel'> {
  if (isRuntimeDetected(detection, 'cursor')) {
    return { reviewRuntime: LOOP_RUNTIME_CURSOR, reviewModel: CURSOR_REVIEW_MODEL }
  }
  for (const row of JUDGE_LADDER) {
    if (row.probe === 'cursor') continue
    if (!isRuntimeDetected(detection, row.probe)) continue
    if (row.runtime === workerRuntime) continue
    return { reviewRuntime: row.runtime, reviewModel: row.model }
  }
  const same = JUDGE_LADDER.find((row) => row.runtime === workerRuntime)
  if (same && isRuntimeDetected(detection, same.probe)) {
    return { reviewRuntime: same.runtime, reviewModel: same.model }
  }
  throw new Error(
    `costPreset could not pick a judge for worker runtime "${workerRuntime}". Install a review runtime or set reviewRuntime.`,
  )
}

/**
 * Bind a named cost preset to a frozen worker+judge stack for this machine.
 * Detection chooses the catalog row; it does not switch models mid-loop.
 */
export function resolveCostPreset(
  preset: CostPreset,
  detection: DetectionResult,
): CostPresetStack {
  if (preset === 'cursor') {
    if (!isRuntimeDetected(detection, 'cursor')) {
      throw new Error('costPreset "cursor" needs the Cursor SDK (@cursor/sdk).')
    }
    return {
      runtime: LOOP_RUNTIME_CURSOR,
      model: CURSOR_LOOP_MODEL,
      reviewRuntime: LOOP_RUNTIME_CURSOR,
      reviewModel: CURSOR_REVIEW_MODEL,
    }
  }
  const worker = pickWorker(preset, detection)
  const judge = pickJudge(worker.runtime, detection)
  return { ...worker, ...judge }
}

export function describeCostPreset(preset: CostPreset, detection: DetectionResult): string {
  try {
    const stack = resolveCostPreset(preset, detection)
    const mix =
      stack.runtime === stack.reviewRuntime
        ? 'same runtime'
        : `${stack.runtime} worker + ${stack.reviewRuntime} judge`
    let intent: string
    switch (preset) {
      case 'minmax':
        intent = 'Efficiency — cheapest capable worker, strongest included judge'
        break
      case 'balanced':
        intent = 'Spend more on the worker; keep the strong judge'
        break
      case 'cursor':
        intent = 'Composer worker + Grok — stay on Cursor'
        break
      default: {
        const _exhaustive: never = preset
        return _exhaustive
      }
    }
    return `${intent}. ${shortModelName(stack.model)} / ${shortModelName(stack.reviewModel)} (${mix}).`
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

/**
 * Bind a user-authored `costPreset` stack from the repo profile `costPresets`
 * map. The JSON *is* the stack — no detection, no ladder. Reserved built-in
 * names cannot be defined here (enforced at parse).
 */
export function resolveUserCostPreset(
  name: string,
  costPresets: UserCostPresetMap,
): CostPresetStack {
  if (!Object.prototype.hasOwnProperty.call(costPresets, name) || costPresets[name] == null) {
    throw new Error(`costPreset "${name}" is not defined in the repo profile costPresets`)
  }
  const parsed = costPresetStackSchema.safeParse(costPresets[name])
  if (!parsed.success) {
    throw new Error(
      `costPreset "${name}" must define runtime, model, reviewRuntime, and reviewModel`,
    )
  }
  return parsed.data
}

function isOpenRouterFreeSlug(slug: string): boolean {
  return slug.startsWith('openrouter/') && slug.endsWith(':free')
}

function isOpenRouterHostedFreeStack(stack: CostPresetStack): boolean {
  if (!isOpenRouterFreeSlug(stack.model) || !isOpenRouterFreeSlug(stack.reviewModel)) {
    return false
  }
  if (stack.escalateModel !== undefined && !isOpenRouterFreeSlug(stack.escalateModel)) {
    return false
  }
  return true
}

/** Setup menu title for a user-authored preset (intent, not just the kebab name). */
export function userCostPresetMenuTitle(name: string, raw: unknown): string {
  const parsed = costPresetStackSchema.safeParse(raw)
  if (parsed.success && isOpenRouterHostedFreeStack(parsed.data)) {
    return `${name} — OpenRouter $0`
  }
  return `${name} — saved preset`
}

/** Human-readable summary for a user-authored preset entry in the setup menu. */
export function describeUserCostPresetRaw(raw: unknown): string {
  const parsed = costPresetStackSchema.safeParse(raw)
  if (!parsed.success) {
    return 'saved preset from the repo profile costPresets'
  }
  const { runtime, model, reviewRuntime, reviewModel } = parsed.data
  const mix =
    runtime === reviewRuntime ? 'same runtime' : `${runtime} worker + ${reviewRuntime} judge`
  const worker = shortModelName(model)
  const judge = shortModelName(reviewModel)
  if (isOpenRouterHostedFreeStack(parsed.data)) {
    return (
      `OpenRouter hosted $0 — not minmax. ${worker} worker / ${judge} judge (${mix}). ` +
      `Needs OPENROUTER_API_KEY. Skip NVIDIA :free (prompt logging). Residual is weaker than Grok.`
    )
  }
  return `saved preset — ${worker} / ${judge} (${mix}).`
}

function isUnset(value: unknown): boolean {
  return value === undefined
}

function workerAndJudgeAreSet(record: Record<string, unknown>): boolean {
  return (
    !isUnset(record.runtime) &&
    !isUnset(record.model) &&
    !isUnset(record.reviewRuntime) &&
    !isUnset(record.reviewModel)
  )
}

/**
 * Fill unset worker/judge keys from the preset. Explicit keys win.
 * Frozen stacks skip detection — `resolveCostPreset` only runs when a fill is needed.
 * Invalid `costPreset` values are left for zod.
 */
export function applyCostPreset(
  raw: unknown,
  detection: DetectionResult,
  costPresets?: UserCostPresetMap,
): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw
  const record = raw as Record<string, unknown>
  const presetRaw = record.costPreset
  if (typeof presetRaw !== 'string') return raw
  if (workerAndJudgeAreSet(record)) return raw
  let stack: CostPresetStack | undefined
  if (isCostPreset(presetRaw)) {
    stack = resolveCostPreset(presetRaw, detection)
  } else if (costPresets && Object.prototype.hasOwnProperty.call(costPresets, presetRaw)) {
    stack = resolveUserCostPreset(presetRaw, costPresets)
  }
  if (stack === undefined) return raw
  const next: Record<string, unknown> = { ...record }
  if (isUnset(next.runtime)) next.runtime = stack.runtime
  if (isUnset(next.model) && next.runtime === stack.runtime) next.model = stack.model
  if (
    isUnset(next.escalateModel) &&
    stack.escalateModel !== undefined &&
    next.runtime === stack.runtime
  ) {
    next.escalateModel = stack.escalateModel
  }
  if (isUnset(next.reviewRuntime)) next.reviewRuntime = stack.reviewRuntime
  if (isUnset(next.reviewModel) && next.reviewRuntime === stack.reviewRuntime) {
    next.reviewModel = stack.reviewModel
  }
  return next
}

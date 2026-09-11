import { collectSetupAnswers, type SetupPrompts } from './setupFlow.js'
import type { DetectionResult } from './detectRuntimes.js'
import type { UserCostPresetMap } from '../loop/costPreset.js'
import type { MenuChoice } from './setupMenus.js'

/** One answered prompt, replayable on re-runs after a back/edit jump. */
export type RecordedAnswer =
  | { kind: 'select'; heading: string; value: string }
  | { kind: 'text'; prompt: string; value: string }

/** One answered row shown in the recap and the review screen. */
export type TrailEntry = {
  kind: 'select' | 'text'
  /** Select heading, or the text prompt string. */
  heading: string
  /** Human-readable value (choice title, or the typed text). */
  display: string
  value: string
}

export type SelectRequest = {
  heading: string
  blurb: string
  choices: readonly MenuChoice[]
  defaultValue: string
  trail: TrailEntry[]
}

export type TextRequest = {
  prompt: string
  defaultValue?: string
  trail: TrailEntry[]
}

export type QuestionOutcome =
  | { status: 'value'; value: string }
  | { status: 'back' }
  | { status: 'abort' }

export type ReviewOutcome =
  | { type: 'save' }
  | { type: 'edit'; index: number }
  | { type: 'abort' }

/** UI contract the driver needs. Ink implements it; tests stub it. */
export type WizardDriverApi = {
  askSelect(req: SelectRequest): Promise<QuestionOutcome>
  askText(req: TextRequest): Promise<QuestionOutcome>
  askReview(trail: TrailEntry[]): Promise<ReviewOutcome>
}

export type WizardContext = {
  outDir: string
  detection?: DetectionResult
  costPresets?: UserCostPresetMap
}

/** Internal control flow: rewind one step. Never escapes the driver. */
class StepBack extends Error {
  readonly name = 'StepBack'
  constructor() {
    super('wizard step back')
  }
}

export function trailToPrefix(trail: readonly TrailEntry[], end = trail.length): RecordedAnswer[] {
  return trail.slice(0, Math.max(0, Math.min(end, trail.length))).map((entry) =>
    entry.kind === 'select'
      ? { kind: 'select' as const, heading: entry.heading, value: entry.value }
      : { kind: 'text' as const, prompt: entry.heading, value: entry.value },
  )
}

function choiceTitle(choices: readonly MenuChoice[], value: string): string {
  return choices.find((choice) => choice.value === value)?.title ?? value
}

function textDisplay(value: string): string {
  return value === '' ? '(omitted)' : value
}

type PassOutcome =
  | { type: 'completed'; answers: Record<string, unknown>; trail: TrailEntry[] }
  | { type: 'back'; base: RecordedAnswer[]; editIndex: number }

function selectRecordMatches(
  rec: RecordedAnswer | undefined,
  heading: string,
  choices: readonly MenuChoice[],
): rec is { kind: 'select'; heading: string; value: string } {
  return (
    rec !== undefined &&
    rec.kind === 'select' &&
    rec.heading === heading &&
    choices.some((choice) => choice.value === rec.value)
  )
}

function textRecordMatches(rec: RecordedAnswer | undefined, prompt: string): rec is { kind: 'text'; prompt: string; value: string } {
  return rec !== undefined && rec.kind === 'text' && rec.prompt === prompt
}

/**
 * One run of the existing question flow against a previous trail.
 * Entries before editIndex replay positionally; the editIndex prompt is
 * always asked; later prompts reuse the first still-unused base entry with
 * a matching heading (and still-valid choice), so unchanged answers are
 * kept and disabled-branch answers simply never re-enter the trail.
 * Back on the first prompt aborts, matching the old per-prompt esc behavior.
 */
export async function runOnePass(
  api: WizardDriverApi,
  ctx: WizardContext,
  base: readonly RecordedAnswer[],
  editIndex: number,
): Promise<PassOutcome> {
  const trail: TrailEntry[] = []
  let editAt = editIndex
  let scan = 0
  let forcedAsked = false

  const scanSelect = (heading: string, choices: readonly MenuChoice[]): number => {
    for (let j = scan; j < base.length; j++) {
      if (selectRecordMatches(base[j], heading, choices)) return j
    }
    return -1
  }

  const scanText = (prompt: string): number => {
    for (let j = scan; j < base.length; j++) {
      if (textRecordMatches(base[j], prompt)) return j
    }
    return -1
  }

  const askSelect = async (
    heading: string,
    blurb: string,
    choices: readonly MenuChoice[],
    defaultValue: string,
  ): Promise<string> => {
    const outcome = await api.askSelect({ heading, blurb, choices, defaultValue, trail: [...trail] })
    if (outcome.status === 'back') throw new StepBack()
    if (outcome.status === 'abort') throw new Error('setup aborted')
    trail.push({ kind: 'select', heading, display: choiceTitle(choices, outcome.value), value: outcome.value })
    return outcome.value
  }

  const askText = async (prompt: string, dflt?: string): Promise<string> => {
    const outcome = await api.askText({ prompt, defaultValue: dflt, trail: [...trail] })
    if (outcome.status === 'back') throw new StepBack()
    if (outcome.status === 'abort') throw new Error('setup aborted')
    trail.push({ kind: 'text', heading: prompt, display: textDisplay(outcome.value), value: outcome.value })
    return outcome.value
  }

  const select: SetupPrompts['select'] = async (heading, blurb, choices, defaultValue) => {
    if (trail.length < editAt) {
      const rec = base[trail.length]
      if (selectRecordMatches(rec, heading, choices)) {
        scan = trail.length + 1
        trail.push({ kind: 'select', heading, display: choiceTitle(choices, rec.value), value: rec.value })
        return rec.value
      }
      editAt = trail.length
    }
    if (trail.length === editAt && !forcedAsked) {
      forcedAsked = true
      // Back / review edit re-asks an answered row: start on the previous answer, not the flow default.
      const prev = base[editAt]
      const hasPrev = selectRecordMatches(prev, heading, choices)
      scan = Math.max(scan, hasPrev ? editAt + 1 : editAt)
      return await askSelect(heading, blurb, choices, hasPrev ? prev.value : defaultValue)
    }
    const found = scanSelect(heading, choices)
    if (found !== -1) {
      const rec = base[found]
      scan = found + 1
      if (rec && rec.kind === 'select') {
        trail.push({ kind: 'select', heading, display: choiceTitle(choices, rec.value), value: rec.value })
        return rec.value
      }
    }
    return await askSelect(heading, blurb, choices, defaultValue)
  }

  const text: SetupPrompts['text'] = async (prompt, dflt) => {
    if (trail.length < editAt) {
      const rec = base[trail.length]
      if (textRecordMatches(rec, prompt)) {
        scan = trail.length + 1
        trail.push({ kind: 'text', heading: prompt, display: textDisplay(rec.value), value: rec.value })
        return rec.value
      }
      editAt = trail.length
    }
    if (trail.length === editAt && !forcedAsked) {
      forcedAsked = true
      // Enter on an empty field keeps the previous answer instead of silently reverting to the default.
      const prev = base[editAt]
      const hasPrev = textRecordMatches(prev, prompt)
      scan = Math.max(scan, hasPrev ? editAt + 1 : editAt)
      return await askText(prompt, hasPrev ? prev.value : dflt)
    }
    const found = scanText(prompt)
    if (found !== -1) {
      const rec = base[found]
      scan = found + 1
      if (rec && rec.kind === 'text') {
        trail.push({ kind: 'text', heading: prompt, display: textDisplay(rec.value), value: rec.value })
        return rec.value
      }
    }
    return await askText(prompt, dflt)
  }

  try {
    const answers = await collectSetupAnswers({ select, text }, ctx.outDir, ctx.detection, ctx.costPresets)
    return { type: 'completed', answers, trail }
  } catch (err) {
    if (err instanceof StepBack) {
      if (trail.length === 0) throw new Error('setup aborted')
      return { type: 'back', base: trailToPrefix(trail), editIndex: trail.length - 1 }
    }
    throw err
  }
}

/**
 * Full wizard: run passes until the review screen saves. Editing row i
 * re-asks that row and silently keeps every later answer that still
 * applies; downstream answers recompute, so branch changes (e.g. Telegram
 * off drops its sub-steps) resolve cleanly.
 */
export async function runSetupWithReview(
  api: WizardDriverApi,
  ctx: WizardContext,
): Promise<Record<string, unknown>> {
  let base: RecordedAnswer[] = []
  let editIndex = 0
  for (;;) {
    const pass = await runOnePass(api, ctx, base, editIndex)
    if (pass.type === 'back') {
      base = pass.base
      editIndex = pass.editIndex
      continue
    }
    const action = await api.askReview(pass.trail)
    if (action.type === 'save') return pass.answers
    if (action.type === 'abort') throw new Error('setup aborted')
    base = trailToPrefix(pass.trail)
    editIndex = Math.max(0, Math.min(action.index, pass.trail.length - 1))
  }
}

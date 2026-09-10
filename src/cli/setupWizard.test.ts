import { describe, expect, it } from 'vitest'
import {
  runOnePass,
  runSetupWithReview,
  trailToPrefix,
  type ReviewOutcome,
  type SelectRequest,
  type TextRequest,
  type TrailEntry,
  type WizardContext,
  type WizardDriverApi,
} from './setupWizard.js'
import {
  COST_PRESET_HEADING,
  SETUP_GATE_CONTINUE,
  SETUP_INTRO_HEADING,
  SETUP_GATE_QUIT,
  SetupDeclinedError,
  TYPICAL_SETUP_STEPS,
} from './setupFlow.js'
import { MENU_CUSTOM } from './setupMenus.js'

const ctx: WizardContext = { outDir: '/tmp/my-task' }

type SelectHandler = (req: SelectRequest) => QuestionOutcomeLike | Promise<QuestionOutcomeLike>
type QuestionOutcomeLike = { status: 'value'; value: string } | { status: 'back' } | { status: 'abort' }

function stubApi(handlers: {
  select?: SelectHandler
  text?: (req: TextRequest) => QuestionOutcomeLike | Promise<QuestionOutcomeLike>
  review?: (trail: TrailEntry[]) => ReviewOutcome | Promise<ReviewOutcome>
} = {}): WizardDriverApi & {
  selectHeadings: string[]
  textPrompts: string[]
  reviewTrails: TrailEntry[][]
} {
  const selectHeadings: string[] = []
  const textPrompts: string[] = []
  const reviewTrails: TrailEntry[][] = []
  return {
    selectHeadings,
    textPrompts,
    reviewTrails,
    async askSelect(req) {
      selectHeadings.push(req.heading)
      if (handlers.select) return handlers.select(req)
      return { status: 'value', value: req.defaultValue }
    },
    async askText(req) {
      textPrompts.push(req.prompt)
      if (handlers.text) return handlers.text(req)
      return { status: 'value', value: req.defaultValue ?? '' }
    },
    async askReview(trail) {
      reviewTrails.push(trail)
      if (handlers.review) return handlers.review(trail)
      return { type: 'save' }
    },
  }
}

describe('runSetupWithReview', () => {
  it('walks the default path, reviews every step, then saves', async () => {
    const api = stubApi()
    const answers = await runSetupWithReview(api, ctx)
    expect(answers.costPreset).toBe('minmax')
    expect(answers.runtime).toBe('cursor')
    expect(answers.reviewRuntime).toBe('cursor')
    expect(answers.verify).toBe('bash /tmp/my-task/verify.sh')
    expect(answers.maxIterations).toBe(8)
    expect(api.reviewTrails).toHaveLength(1)
    expect(api.reviewTrails[0]).toHaveLength(TYPICAL_SETUP_STEPS)
    expect(api.selectHeadings.length + api.textPrompts.length).toBe(TYPICAL_SETUP_STEPS)
  })

  it('goes back one step and re-asks from there', async () => {
    let backed = false
    const api = stubApi({
      select: (req) => {
        if (req.heading === 'Max iterations' && !backed) {
          backed = true
          return { status: 'back' }
        }
        return { status: 'value', value: req.defaultValue }
      },
    })
    const answers = await runSetupWithReview(api, ctx)
    expect(answers.maxIterations).toBe(8)
    const count = (heading: string): number => api.selectHeadings.filter((h) => h === heading).length
    expect(count('Max iterations')).toBe(2)
    expect(count('Final verify command')).toBe(2)
    expect(count('Verify mode')).toBe(1)
    expect(count(SETUP_INTRO_HEADING)).toBe(1)
    expect(backed).toBe(true)
  })

  it('review edit re-asks one row and keeps every other answer', async () => {
    let reviews = 0
    const api = stubApi({
      select: (req) => {
        if (req.heading === 'Max iterations' && reviews === 1) return { status: 'value', value: '12' }
        return { status: 'value', value: req.defaultValue }
      },
      review: (trail) => {
        reviews += 1
        if (reviews === 1) {
          const index = trail.findIndex((entry) => entry.heading === 'Max iterations')
          expect(index).toBeGreaterThan(0)
          return { type: 'edit', index }
        }
        return { type: 'save' }
      },
    })
    const answers = await runSetupWithReview(api, ctx)
    expect(answers.maxIterations).toBe(12)
    expect(api.reviewTrails).toHaveLength(2)
    expect(api.reviewTrails[1]).toHaveLength(api.reviewTrails[0].length)
    const edited = api.reviewTrails[1].find((entry) => entry.heading === 'Max iterations')
    expect(edited?.value).toBe('12')
    const count = (heading: string): number => api.selectHeadings.filter((h) => h === heading).length
    expect(count('Max iterations')).toBe(2)
    expect(count(SETUP_INTRO_HEADING)).toBe(1)
    expect(count('Verify mode')).toBe(1)
    expect(count('Stagnation threshold')).toBe(1)
  })

  it('drops the telegram branch when notify is switched off on edit', async () => {
    let reviews = 0
    const api = stubApi({
      select: (req) => {
        if (req.heading === 'Send completion report to Telegram' && reviews === 1) {
          return { status: 'value', value: 'n' }
        }
        return { status: 'value', value: req.defaultValue }
      },
      review: (trail) => {
        reviews += 1
        if (reviews === 1) {
          expect(trail.some((entry) => entry.heading === 'Telegram chatId')).toBe(true)
          const index = trail.findIndex((entry) => entry.heading === 'Send completion report to Telegram')
          expect(index).toBeGreaterThan(0)
          return { type: 'edit', index }
        }
        return { type: 'save' }
      },
    })
    const answers = await runSetupWithReview(api, ctx)
    expect(answers.notifyTelegram).toBe(false)
    expect(answers.telegramAttachReview).toBeUndefined()
    expect(answers.requireNotify).toBeUndefined()
    expect(answers.profile).not.toHaveProperty('telegramNotify')
    const second = api.reviewTrails[1]
    expect(second.some((entry) => entry.heading === 'Telegram chatId')).toBe(false)
    expect(second.some((entry) => entry.heading === 'Attach latest review.md to Telegram')).toBe(false)
    expect(second.some((entry) => entry.heading === 'Abort if Telegram preflight fails (requireNotify)')).toBe(false)
    expect(second.some((entry) => entry.heading === 'Telegram notify on success')).toBe(false)
    expect(second).toHaveLength(api.reviewTrails[0].length - 6)
    expect(second.some((entry) => entry.heading === 'Custom notifyCommand')).toBe(true)
  })

  it('quits without saving when the review screen aborts', async () => {
    const api = stubApi({ review: () => ({ type: 'abort' }) })
    await expect(runSetupWithReview(api, ctx)).rejects.toThrow('setup aborted')
  })

  it('declines when the intro gate quits', async () => {
    const api = stubApi({
      select: (req) =>
        req.heading === SETUP_INTRO_HEADING
          ? { status: 'value', value: SETUP_GATE_QUIT }
          : { status: 'value', value: req.defaultValue },
    })
    await expect(runSetupWithReview(api, ctx)).rejects.toBeInstanceOf(SetupDeclinedError)
    expect(api.reviewTrails).toHaveLength(0)
  })

  it('drops the taskwarrior uuid branch when the HITL provider is switched on edit', async () => {
    const uuid = '12345678-1234-1234-1234-123456789012'
    let reviews = 0
    const api = stubApi({
      select: (req) => {
        if (req.heading === 'Taskwarrior UUID' && reviews === 0) return { status: 'value', value: MENU_CUSTOM }
        if (req.heading === 'HITL provider' && reviews === 1) return { status: 'value', value: 'github' }
        return { status: 'value', value: req.defaultValue }
      },
      text: (req) => {
        if (req.prompt === 'Taskwarrior UUID') return { status: 'value', value: uuid }
        return { status: 'value', value: req.defaultValue ?? '' }
      },
      review: (trail) => {
        reviews += 1
        if (reviews === 1) {
          expect(trail.some((entry) => entry.heading === 'Taskwarrior UUID' && entry.value === uuid)).toBe(true)
          const index = trail.findIndex((entry) => entry.heading === 'HITL provider')
          expect(index).toBeGreaterThan(0)
          return { type: 'edit', index }
        }
        return { type: 'save' }
      },
    })
    const answers = await runSetupWithReview(api, ctx)
    expect(answers.hitlProvider).toBe('github')
    expect(answers.taskwarriorUuid).toBeUndefined()
    const second = api.reviewTrails[1]
    expect(second.some((entry) => entry.heading === 'Taskwarrior UUID')).toBe(false)
    expect(second).toHaveLength(api.reviewTrails[0].length - 2)
  })
})

describe('runOnePass replay', () => {
  it('replays a matching base without asking', async () => {
    const api = stubApi()
    const pass = await runOnePass(
      api,
      ctx,
      [{ kind: 'select', heading: SETUP_INTRO_HEADING, value: SETUP_GATE_CONTINUE }],
      1,
    )
    expect(pass.type).toBe('completed')
    expect(api.selectHeadings[0]).toBe(COST_PRESET_HEADING)
  })

  it('re-asks when the cached value is no longer a valid choice', async () => {
    const api = stubApi()
    const pass = await runOnePass(
      api,
      ctx,
      [{ kind: 'select', heading: SETUP_INTRO_HEADING, value: 'bogus' }],
      1,
    )
    expect(pass.type).toBe('completed')
    expect(api.selectHeadings[0]).toBe(SETUP_INTRO_HEADING)
  })

  it('aborts on back at the first prompt', async () => {
    const api = stubApi({ select: () => ({ status: 'back' }) })
    await expect(runOnePass(api, ctx, [], 0)).rejects.toThrow('setup aborted')
  })
})

describe('trailToPrefix', () => {
  it('converts and clamps the edited range', () => {
    const trail: TrailEntry[] = [
      { kind: 'select', heading: 'a', display: 'a', value: 'a' },
      { kind: 'text', heading: 'b', display: 'b', value: 'b' },
    ]
    expect(trailToPrefix(trail, 1)).toEqual([{ kind: 'select', heading: 'a', value: 'a' }])
    expect(trailToPrefix(trail, 99)).toHaveLength(2)
    expect(trailToPrefix(trail, -5)).toEqual([])
  })
})

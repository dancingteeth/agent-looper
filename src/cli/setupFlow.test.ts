import { describe, expect, it } from 'vitest'
import {
  collectSetupAnswers,
  COST_PRESET_HEADING,
  SAVE_PRESET_AFTER_CUSTOM_HEADING,
  SAVE_PRESET_NAME_PROMPT,
  SetupDeclinedError,
  SETUP_GATE_CONTINUE,
  SETUP_GATE_QUIT,
  SETUP_INTRO_HEADING,
  TYPICAL_SETUP_STEPS,
  type SetupPrompts,
} from './setupFlow.js'
import { COST_PRESET_CUSTOM } from '../loop/costPreset.js'
import { MENU_OMIT } from './setupMenus.js'

function defaultingPrompts(): SetupPrompts {
  return {
    async select(_heading, _blurb, _choices, defaultValue) {
      return defaultValue
    },
    async text(_prompt, dflt) {
      return dflt ?? ''
    },
  }
}

describe('collectSetupAnswers', () => {
  it('writes a schema-shaped minmax bundle when every prompt takes the default', async () => {
    const answers = await collectSetupAnswers(defaultingPrompts(), '/tmp/my-task')
    expect(answers.costPreset).toBe('minmax')
    expect(answers.runtime).toBe('cursor')
    expect(answers.reviewRuntime).toBe('cursor')
    expect(answers.model).toBe('composer-2.5')
    expect(answers.reviewModel).toBe('grok-4.6')
    expect(answers.verify).toBe('bash /tmp/my-task/verify.sh')
    expect(answers.maxIterations).toBe(8)
    expect(answers.notifyTelegram).toBe(true)
    expect(answers.hitlProvider).toBe('taskwarrior')
    expect((answers.profile as { defaultBranch: string }).defaultBranch).toBe('main')
  })

  it('omits optional custom fields when MENU_OMIT is the default', async () => {
    const answers = await collectSetupAnswers(defaultingPrompts(), '/tmp/my-task')
    expect(answers.notifyCommand).toBeUndefined()
    expect(answers.taskwarriorUuid).toBeUndefined()
    expect(answers.finalVerify).toBeUndefined()
    expect(MENU_OMIT).toBe('')
  })

  it('skips Telegram chatId and attach/preflight when notify is off', async () => {
    const headings: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, _choices, defaultValue) {
        headings.push(heading)
        if (heading === 'Send completion report to Telegram') return 'n'
        return defaultValue
      },
      async text(_prompt, dflt) {
        return dflt ?? ''
      },
    }
    const answers = await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(answers.notifyTelegram).toBe(false)
    expect(answers.telegramAttachReview).toBeUndefined()
    expect(answers.requireNotify).toBeUndefined()
    expect(answers.profile).not.toHaveProperty('telegramNotify')
    expect(headings).not.toContain('Telegram chatId')
    expect(headings).not.toContain('Attach latest review.md to Telegram')
    expect(headings).not.toContain('Abort if Telegram preflight fails (requireNotify)')
    expect(headings).not.toContain('Telegram notify on success')
    expect(headings).not.toContain('Telegram notify on failure')
    expect(headings).not.toContain('Telegram attach review (profile)')
    expect(headings).toContain('Custom notifyCommand')
  })

  it('asks Telegram chatId and attach/preflight when notify is on', async () => {
    const headings: string[] = []
    await collectSetupAnswers(
      {
        async select(heading, _blurb, _choices, defaultValue) {
          headings.push(heading)
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
    )
    expect(headings).toContain('Telegram chatId')
    expect(headings).toContain('Attach latest review.md to Telegram')
  })

  it('asks reasoning effort when a new preset uses a runtime that honors it', async () => {
    const headings: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, _choices, defaultValue) {
        headings.push(heading)
        if (heading === COST_PRESET_HEADING) return COST_PRESET_CUSTOM
        if (heading === 'Worker runtime') return 'pi'
        return defaultValue
      },
      async text(prompt, dflt) {
        if (prompt === SAVE_PRESET_NAME_PROMPT) return 'pi-stack'
        return dflt ?? ''
      },
    }
    await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(headings).toContain('Reasoning effort')
    expect(headings).toContain('Escalate reasoning effort')
    expect(headings).not.toContain('Cline reasoning effort')
  })

  it('skips reasoning effort when the worker runtime ignores it', async () => {
    const headings: string[] = []
    await collectSetupAnswers(
      {
        async select(heading, _blurb, _choices, defaultValue) {
          headings.push(heading)
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
    )
    expect(headings).not.toContain('Reasoning effort')
    expect(headings).not.toContain('Escalate reasoning effort')
  })

  it('skips the worker encyclopedia on a named cost preset', async () => {
    const headings: string[] = []
    const answers = await collectSetupAnswers(
      {
        async select(heading, _blurb, _choices, defaultValue) {
          headings.push(heading)
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
    )
    expect(answers.costPreset).toBe('minmax')
    expect(headings).toContain(COST_PRESET_HEADING)
    expect(headings).not.toContain('Worker runtime')
    expect(headings).not.toContain('Worker model')
    expect(headings).not.toContain('Judge runtime (reviewRuntime)')
    expect(headings).not.toContain('Judge model (reviewModel)')
  })

  it('walks the encyclopedia for one-off custom without a catalog name', async () => {
    const headings: string[] = []
    const answers = await collectSetupAnswers(
      {
        async select(heading, _blurb, _choices, defaultValue) {
          headings.push(heading)
          if (heading === COST_PRESET_HEADING) return COST_PRESET_CUSTOM
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
    )
    expect(headings).toContain('Worker runtime')
    expect(headings).toContain('Worker model')
    expect(headings).toContain('Judge runtime (reviewRuntime)')
    expect(headings).toContain('Judge model (reviewModel)')
    expect(headings).toContain(SAVE_PRESET_AFTER_CUSTOM_HEADING)
    expect(answers.costPreset).toBeUndefined()
    expect(answers.saveCostPreset).toBeUndefined()
    expect(answers.runtime).toBe('cursor')
  })

  it('expands a user-defined costPreset name and skips the encyclopedia', async () => {
    const headings: string[] = []
    let costPresetChoices: { value: string }[] = []
    const userPresets = {
      'cheap-pi': {
        runtime: 'pi',
        model: 'openrouter/deepseek/deepseek-chat',
        escalateModel: 'openrouter/qwen/qwen3-coder-plus',
        reviewRuntime: 'pi',
        reviewModel: 'openrouter/qwen/qwen3-coder-plus',
      },
    }
    const answers = await collectSetupAnswers(
      {
        async select(heading, _blurb, choices, defaultValue) {
          headings.push(heading)
          if (heading === COST_PRESET_HEADING) {
            costPresetChoices = choices.map((choice) => ({ value: choice.value }))
            return 'cheap-pi'
          }
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
      undefined,
      userPresets,
    )
    expect(answers.costPreset).toBe('cheap-pi')
    expect(answers.runtime).toBe('pi')
    expect(answers.model).toBe('openrouter/deepseek/deepseek-chat')
    expect(answers.reviewRuntime).toBe('pi')
    expect(answers.reviewModel).toBe('openrouter/qwen/qwen3-coder-plus')
    expect(headings).toContain(COST_PRESET_HEADING)
    expect(headings).not.toContain('Worker runtime')
    expect(headings).not.toContain('Worker model')
    expect(headings).not.toContain('Judge runtime (reviewRuntime)')
    expect(headings).not.toContain('Judge model (reviewModel)')
    const choiceValues = costPresetChoices.map((choice) => choice.value)
    expect(choiceValues).toContain('cheap-pi')
    expect(choiceValues).toContain('minmax')
    expect(choiceValues).toContain('balanced')
    expect(choiceValues).toContain('cursor')
    expect(choiceValues).toContain(COST_PRESET_CUSTOM)
    expect(choiceValues).not.toContain('__save_preset__')
  })

  it('skips the Taskwarrior UUID step when HITL is github', async () => {
    const headings: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, _choices, defaultValue) {
        headings.push(heading)
        if (heading === 'HITL provider') return 'github'
        return defaultValue
      },
      async text(_prompt, dflt) {
        return dflt ?? ''
      },
    }
    const answers = await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(answers.hitlProvider).toBe('github')
    expect(answers.taskwarriorUuid).toBeUndefined()
    expect(headings).not.toContain('Taskwarrior UUID')
  })

  it('asks for a secondary model once a secondary runtime is picked', async () => {
    const headings: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, _choices, defaultValue) {
        headings.push(heading)
        if (heading === 'Secondary review runtime') return 'dsh'
        if (heading === 'Secondary judge model (reviewSecondaryModel)') return 'deepseek-official/deepseek-v4-pro'
        return defaultValue
      },
      async text(_prompt, dflt) {
        return dflt ?? ''
      },
    }
    const answers = await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(answers.reviewSecondaryRuntime).toBe('dsh')
    expect(answers.reviewSecondaryModel).toBe('deepseek-official/deepseek-v4-pro')
    expect(headings).toContain('Secondary judge model (reviewSecondaryModel)')
  })

  it('skips the secondary model prompt when secondary is none', async () => {
    const headings: string[] = []
    await collectSetupAnswers(
      {
        async select(heading, _blurb, _choices, defaultValue) {
          headings.push(heading)
          return defaultValue
        },
        async text(_prompt, dflt) {
          return dflt ?? ''
        },
      },
      '/tmp/my-task',
    )
    expect(headings).not.toContain('Secondary judge model (reviewSecondaryModel)')
  })

  it('stops when the intro gate is quit', async () => {
    const headings: string[] = []
    let introChoices: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, choices, defaultValue) {
        headings.push(heading)
        if (heading === SETUP_INTRO_HEADING) {
          introChoices = choices.map((choice) => choice.value)
          return SETUP_GATE_QUIT
        }
        return defaultValue
      },
      async text(_prompt, dflt) {
        return dflt ?? ''
      },
    }
    await expect(collectSetupAnswers(prompts, '/tmp/my-task')).rejects.toBeInstanceOf(SetupDeclinedError)
    expect(headings).toEqual([SETUP_INTRO_HEADING])
    expect(introChoices).toEqual([SETUP_GATE_CONTINUE, SETUP_GATE_QUIT])
  })

  it('keeps TYPICAL_SETUP_STEPS aligned with the default Cursor path', async () => {
    let n = 0
    const prompts: SetupPrompts = {
      async select(_heading, _blurb, _choices, defaultValue) {
        n += 1
        return defaultValue
      },
      async text(_prompt, dflt) {
        n += 1
        return dflt ?? ''
      },
    }
    await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(n).toBe(TYPICAL_SETUP_STEPS)
  })

  it('continues the wizard after saving a named cost preset', async () => {
    const headings: string[] = []
    const prompts: SetupPrompts = {
      async select(heading, _blurb, _choices, defaultValue) {
        headings.push(heading)
        if (heading === COST_PRESET_HEADING) return COST_PRESET_CUSTOM
        if (heading === SAVE_PRESET_AFTER_CUSTOM_HEADING) return 'y'
        return defaultValue
      },
      async text(prompt, dflt) {
        if (prompt === SAVE_PRESET_NAME_PROMPT) return 'hy3-dsh'
        return dflt ?? ''
      },
    }
    const answers = await collectSetupAnswers(prompts, '/tmp/my-task')
    expect(answers.saveCostPreset).toBe('hy3-dsh')
    expect(answers.costPreset).toBe('hy3-dsh')
    expect(answers.runtime).toBe('cursor')
    expect(answers.reviewRuntime).toBe('cursor')
    expect(answers.verify).toBe('bash /tmp/my-task/verify.sh')
    expect(headings).toContain(SETUP_INTRO_HEADING)
    expect(headings).toContain(COST_PRESET_HEADING)
    expect(headings).toContain('Worker runtime')
    expect(headings).toContain('Judge runtime (reviewRuntime)')
    expect(headings).toContain('Verify command')
    expect(headings).toContain('Send completion report to Telegram')
  })
})

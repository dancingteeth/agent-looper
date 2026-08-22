import { describe, expect, it } from 'vitest'
import { collectSetupAnswers, type SetupPrompts } from './setupFlow.js'
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
  it('writes a schema-shaped cursor bundle when every prompt takes the default', async () => {
    const answers = await collectSetupAnswers(defaultingPrompts(), '/tmp/my-task')
    expect(answers.runtime).toBe('cursor')
    expect(answers.reviewRuntime).toBe('cursor')
    expect(answers).not.toHaveProperty('model')
    expect(answers).not.toHaveProperty('reviewModel')
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
})

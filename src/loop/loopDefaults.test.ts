import { describe, expect, it } from 'vitest'
import { applyLoopDefaults, pickLoopDefaults } from './loopDefaults.js'
import { parseLoopConfig } from './loopConfig.js'

describe('pickLoopDefaults', () => {
  it('keeps runtime and drops per-loop scoreboard keys', () => {
    expect(
      pickLoopDefaults({
        runtime: 'dsh',
        verify: 'bash verify.sh',
        verifyMode: 'skill',
        verifySkill: 'VERIFY.skill.md',
        finalVerify: 'true',
        taskwarriorUuid: '11111111-1111-4111-8111-111111111111',
        maxIterations: 5,
      }),
    ).toEqual({
      runtime: 'dsh',
      maxIterations: 5,
    })
  })
})

describe('applyLoopDefaults', () => {
  it('fills omitted loop.json keys then parses', () => {
    const merged = applyLoopDefaults({ verify: 'true' }, { runtime: 'dsh', reviewRuntime: 'dsh' })
    const parsed = parseLoopConfig(merged)
    expect(parsed.runtime).toBe('dsh')
    expect(parsed.reviewRuntime).toBe('dsh')
    expect(parsed.verify).toBe('true')
  })

  it('lets loop.json win on conflict', () => {
    const merged = applyLoopDefaults(
      { verify: 'true', runtime: 'cursor' },
      { runtime: 'dsh' },
    )
    expect(parseLoopConfig(merged).runtime).toBe('cursor')
  })
})

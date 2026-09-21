import { describe, expect, it } from 'vitest'
import { applyLoopDefaults, pickLoopDefaults, reconcileLoopDefaults } from './loopDefaults.js'
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

  it('drops OpenCode worker slugs when loop.json pins Cursor', () => {
    const { merged, warnings } = reconcileLoopDefaults(
      { verify: 'true', runtime: 'cursor' },
      {
        costPreset: 'minmax',
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        escalateModel: 'opencode-go/qwen3.7-plus',
        reviewRuntime: 'cursor',
        reviewModel: 'grok-4.6',
      },
    )
    expect(merged).toMatchObject({
      verify: 'true',
      runtime: 'cursor',
      model: 'composer-2.5',
      reviewRuntime: 'cursor',
      reviewModel: 'grok-4.6',
    })
    expect(merged).not.toHaveProperty('escalateModel')
    expect(warnings.some((line) => line.includes('escalateModel'))).toBe(true)
    expect(warnings.some((line) => line.includes('opencode-go/hy3'))).toBe(true)

    const parsed = parseLoopConfig(merged)
    expect(parsed.runtime).toBe('cursor')
    expect(parsed.model).toBe('composer-2.5')
    expect(parsed.escalateModel).toBeUndefined()
    expect(parsed.reviewModel).toBe('grok-4.6')
  })

  it('keeps an explicit loop.json escalateModel for parse to reject', () => {
    const { merged, warnings } = reconcileLoopDefaults(
      { verify: 'true', runtime: 'cursor', escalateModel: 'opencode-go/qwen3.7-plus' },
      { runtime: 'opencode', escalateModel: 'opencode-go/qwen3.7-plus' },
    )
    expect(merged).toMatchObject({
      runtime: 'cursor',
      escalateModel: 'opencode-go/qwen3.7-plus',
    })
    expect(warnings).toEqual([])
    expect(() => parseLoopConfig(merged)).toThrow(/worker fallback/)
  })

  it('replaces a Cursor reviewModel when loop.json pins an OpenCode judge', () => {
    const { merged, warnings } = reconcileLoopDefaults(
      { verify: 'true', runtime: 'cursor', reviewRuntime: 'opencode' },
      { reviewRuntime: 'cursor', reviewModel: 'grok-4.6' },
    )
    expect(merged).toMatchObject({
      runtime: 'cursor',
      reviewRuntime: 'opencode',
      reviewModel: 'opencode-go/deepseek-v4-pro',
    })
    expect(warnings.some((line) => line.includes('reviewModel'))).toBe(true)
    expect(parseLoopConfig(merged).reviewModel).toBe('opencode-go/deepseek-v4-pro')
  })

  it('does not strip a matching OpenCode stack', () => {
    const { merged, warnings } = reconcileLoopDefaults(
      { verify: 'true' },
      {
        runtime: 'opencode',
        model: 'opencode-go/hy3',
        escalateModel: 'opencode-go/qwen3.7-plus',
        reviewRuntime: 'cursor',
        reviewModel: 'grok-4.6',
      },
    )
    expect(warnings).toEqual([])
    expect(merged).toMatchObject({
      runtime: 'opencode',
      model: 'opencode-go/hy3',
      escalateModel: 'opencode-go/qwen3.7-plus',
      reviewModel: 'grok-4.6',
    })
  })
})

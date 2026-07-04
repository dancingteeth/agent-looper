import { describe, expect, it } from 'vitest'
import { resolveLoopAgent } from './loopAgentConfig.js'
import { loopConfigSchema, mergeLoopConfig, parseLoopConfig } from './loopConfig.js'

describe('loopConfigSchema', () => {
  it('applies defaults', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.maxIterations).toBe(8)
    expect(parsed.delayMs).toBe(1500)
  })

  it('defaults syncOnSuccess to true', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.syncOnSuccess).toBe(true)
  })

  it('accepts legacy syncPostgres alias', () => {
    const parsed = parseLoopConfig({ verify: 'true', syncPostgres: false })
    expect(parsed.syncOnSuccess).toBe(false)
  })

  it('accepts taskwarriorProject override', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      taskwarriorProject: 'zwook',
    })
    expect(parsed.taskwarriorProject).toBe('zwook')
  })

  it('accepts cline-pass runtime with default model', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      runtime: 'cline-pass',
    })
    expect(parsed.runtime).toBe('cline-pass')
    expect(resolveLoopAgent(parsed).model).toBe('cline-pass/deepseek-v4-flash')
  })

  it('accepts optional hitlCheck', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'true',
      hitlCheck: 'affiliate hub ref capture',
    })
    expect(parsed.hitlCheck).toBe('affiliate hub ref capture')
  })

  it('rejects empty hitlCheck', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        hitlCheck: '   ',
      }),
    ).toThrow()
  })

  it('defaults stagnationThreshold to 3', () => {
    const parsed = loopConfigSchema.parse({ verify: 'true' })
    expect(parsed.stagnationThreshold).toBe(3)
  })

  it('rejects numeric taskwarriorUuid', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        taskwarriorUuid: '217',
      }),
    ).toThrow()
  })

  it('rejects taskwarriorProject with spaces', () => {
    expect(() =>
      loopConfigSchema.parse({
        verify: 'true',
        taskwarriorProject: 'my project',
      }),
    ).toThrow(/spaces/i)
  })
})

describe('mergeLoopConfig', () => {
  it('overrides verify from CLI', () => {
    const base = loopConfigSchema.parse({ verify: 'echo a', maxIterations: 3 })
    const merged = mergeLoopConfig(base, { verify: 'echo b' })
    expect(merged.verify).toBe('echo b')
    expect(merged.maxIterations).toBe(3)
  })
})

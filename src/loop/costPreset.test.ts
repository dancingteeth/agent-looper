import { describe, expect, it } from 'vitest'
import { detectionOf, emptyDetection } from '../cli/detectRuntimes.js'
import {
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODEL,
  DEFAULT_CLINE_PASS_ESCALATE_MODEL,
  DEFAULT_CLINE_PASS_LOOP_MODEL,
  DEFAULT_CODEX_LOOP_MODEL,
  DEFAULT_CODEX_REVIEW_MODEL,
  DEFAULT_DSH_LOOP_MODEL,
  DEFAULT_DSH_REVIEW_MODEL,
  DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
  DEFAULT_OPENCODE_GO_REVIEW_MODEL,
  DEFAULT_PI_ESCALATE_MODEL,
  DEFAULT_PI_LOOP_MODEL,
} from './loopAgentConfig.js'
import {
  applyCostPreset,
  assertUserCostPresetName,
  describeCostPreset,
  describeUserCostPresetRaw,
  isReservedCostPresetName,
  resolveCostPreset,
  parseCostPresetsCatalog,
  resolveUserCostPreset,
} from './costPreset.js'
import { parseLoopConfig } from './loopConfig.js'

const goCursor = detectionOf({ opencode: 'detected', cursor: 'detected' })
const cursorOnly = detectionOf({ cursor: 'detected' })
const piOnly = detectionOf({ pi: 'detected' })
const opencodeOnly = detectionOf({ opencode: 'detected' })
const clineCursor = detectionOf({ cline: 'detected', cursor: 'detected' })
const dshOnly = detectionOf({ dsh: 'detected' })
const codexOnly = detectionOf({ codex: 'detected' })
const piCursor = detectionOf({ pi: 'detected', cursor: 'detected' })

describe('resolveCostPreset', () => {
  it('binds Go+Cursor minmax to Hy3 worker and Grok judge', () => {
    expect(resolveCostPreset('minmax', goCursor)).toEqual({
      runtime: 'opencode',
      model: 'opencode-go/hy3',
      escalateModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    })
  })

  it('binds Go+Cursor balanced to Qwen Plus worker and Grok judge', () => {
    expect(resolveCostPreset('balanced', goCursor)).toEqual({
      runtime: 'opencode',
      model: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
      escalateModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    })
  })

  it('binds the cursor preset to Composer + Grok even when Go is installed', () => {
    expect(resolveCostPreset('cursor', goCursor)).toEqual({
      runtime: 'cursor',
      model: CURSOR_LOOP_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    })
  })

  it('binds all three named presets to Composer + Grok on Cursor-only', () => {
    for (const preset of ['minmax', 'balanced', 'cursor'] as const) {
      const stack = resolveCostPreset(preset, cursorOnly)
      expect(stack.runtime).toBe('cursor')
      expect(stack.model).toBe(CURSOR_LOOP_MODEL)
      expect(stack.reviewRuntime).toBe('cursor')
      expect(stack.reviewModel).toBe(CURSOR_REVIEW_MODEL)
    }
  })

  it('binds Pi+Cursor minmax to DeepSeek Chat + Grok', () => {
    expect(resolveCostPreset('minmax', piCursor)).toMatchObject({
      runtime: 'pi',
      model: DEFAULT_PI_LOOP_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    })
  })

  it('binds Pi-only minmax to cheap worker + that runtime’s stronger judge', () => {
    expect(resolveCostPreset('minmax', piOnly)).toEqual({
      runtime: 'pi',
      model: DEFAULT_PI_LOOP_MODEL,
      escalateModel: DEFAULT_PI_ESCALATE_MODEL,
      reviewRuntime: 'pi',
      reviewModel: DEFAULT_PI_ESCALATE_MODEL,
    })
  })

  it('binds OpenCode-only minmax to Hy3 + Go Pro', () => {
    expect(resolveCostPreset('minmax', opencodeOnly)).toEqual({
      runtime: 'opencode',
      model: 'opencode-go/hy3',
      escalateModel: DEFAULT_OPENCODE_GO_ESCALATE_MODEL,
      reviewRuntime: 'opencode',
      reviewModel: DEFAULT_OPENCODE_GO_REVIEW_MODEL,
    })
  })

  it('binds Cline Pass + Cursor minmax to Flash + Grok', () => {
    expect(resolveCostPreset('minmax', clineCursor)).toMatchObject({
      runtime: 'cline-pass',
      model: DEFAULT_CLINE_PASS_LOOP_MODEL,
      escalateModel: DEFAULT_CLINE_PASS_ESCALATE_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    })
  })

  it('binds DSH-only minmax to Flash worker + Pro judge', () => {
    expect(resolveCostPreset('minmax', dshOnly)).toEqual({
      runtime: 'dsh',
      model: DEFAULT_DSH_LOOP_MODEL,
      escalateModel: DEFAULT_DSH_REVIEW_MODEL,
      reviewRuntime: 'dsh',
      reviewModel: DEFAULT_DSH_REVIEW_MODEL,
    })
  })

  it('binds Codex-only minmax to Luna + Sol', () => {
    expect(resolveCostPreset('minmax', codexOnly)).toEqual({
      runtime: 'codex',
      model: DEFAULT_CODEX_LOOP_MODEL,
      escalateModel: 'gpt-5.6-terra',
      reviewRuntime: 'codex',
      reviewModel: DEFAULT_CODEX_REVIEW_MODEL,
    })
  })

  it('throws when the cursor preset has no Cursor SDK', () => {
    expect(() => resolveCostPreset('cursor', piOnly)).toThrow(/needs the Cursor SDK/)
  })

  it('throws when nothing is detected', () => {
    expect(() => resolveCostPreset('minmax', emptyDetection())).toThrow(/needs a worker runtime/)
  })
})

describe('applyCostPreset', () => {
  it('fills unset keys on a sparse loop.json', () => {
    const filled = applyCostPreset({ verify: 'true', costPreset: 'minmax' }, goCursor) as Record<
      string,
      unknown
    >
    expect(filled.runtime).toBe('opencode')
    expect(filled.model).toBe('opencode-go/hy3')
    expect(filled.reviewRuntime).toBe('cursor')
    expect(filled.reviewModel).toBe(CURSOR_REVIEW_MODEL)
    expect(filled.costPreset).toBe('minmax')
  })

  it('keeps an explicit worker model (frozen stack)', () => {
    const filled = applyCostPreset(
      {
        verify: 'true',
        costPreset: 'minmax',
        runtime: 'opencode',
        model: 'opencode-go/deepseek-v4-flash',
      },
      goCursor,
    ) as Record<string, unknown>
    expect(filled.model).toBe('opencode-go/deepseek-v4-flash')
    expect(filled.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })

  it('does not put Hy3 on an explicit cursor runtime', () => {
    const filled = applyCostPreset(
      { verify: 'true', costPreset: 'minmax', runtime: 'cursor' },
      goCursor,
    ) as Record<string, unknown>
    expect(filled.runtime).toBe('cursor')
    expect(filled.model).toBeUndefined()
    expect(filled.reviewRuntime).toBe('cursor')
    expect(filled.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })

  it('does not resolve detection when worker and judge are already frozen', () => {
    const frozen = {
      verify: 'true',
      costPreset: 'minmax' as const,
      runtime: 'cursor',
      model: CURSOR_LOOP_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    }
    expect(() => applyCostPreset(frozen, emptyDetection())).not.toThrow()
    const filled = applyCostPreset(frozen, emptyDetection()) as Record<string, unknown>
    expect(filled.runtime).toBe('cursor')
    expect(filled.model).toBe(CURSOR_LOOP_MODEL)
    expect(filled.reviewRuntime).toBe('cursor')
    expect(filled.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })

  it('still throws on a sparse preset when nothing is detected', () => {
    expect(() => applyCostPreset({ verify: 'true', costPreset: 'minmax' }, emptyDetection())).toThrow(
      /needs a worker runtime/,
    )
  })
})

describe('parseLoopConfig costPreset', () => {
  it('resolves sparse minmax before the cursor runtime default', () => {
    const parsed = parseLoopConfig(
      { verify: 'true', costPreset: 'minmax' },
      { detection: goCursor },
    )
    expect(parsed.runtime).toBe('opencode')
    expect(parsed.model).toBe('opencode-go/hy3')
    expect(parsed.reviewRuntime).toBe('cursor')
    expect(parsed.reviewModel).toBe(CURSOR_REVIEW_MODEL)
    expect(parsed.costPreset).toBe('minmax')
  })

  it('fails closed when detection is omitted for a sparse builtin preset', () => {
    expect(() => parseLoopConfig({ verify: 'true', costPreset: 'minmax' })).toThrow(
      /needs a worker runtime/,
    )
  })

  it('binds minmax from explicit Cursor-only detection', () => {
    const parsed = parseLoopConfig(
      { verify: 'true', costPreset: 'minmax' },
      { detection: cursorOnly },
    )
    expect(parsed.runtime).toBe('cursor')
    expect(parsed.model).toBe(CURSOR_LOOP_MODEL)
    expect(parsed.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })

  it('parses a frozen minmax stack when detection is empty', () => {
    const parsed = parseLoopConfig(
      {
        verify: 'true',
        costPreset: 'minmax',
        runtime: 'cursor',
        model: CURSOR_LOOP_MODEL,
        reviewRuntime: 'cursor',
        reviewModel: CURSOR_REVIEW_MODEL,
      },
      { detection: emptyDetection() },
    )
    expect(parsed.runtime).toBe('cursor')
    expect(parsed.model).toBe(CURSOR_LOOP_MODEL)
    expect(parsed.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })
})

describe('describeCostPreset', () => {
  it('names both sides of a mixed stack', () => {
    expect(describeCostPreset('minmax', goCursor)).toMatch(/hy3/i)
    expect(describeCostPreset('minmax', goCursor)).toMatch(/grok-4\.6/i)
    expect(describeCostPreset('minmax', goCursor)).toMatch(/opencode worker \+ cursor judge/)
  })
})

const cheapPi = {
  runtime: 'pi',
  model: 'openrouter/deepseek/deepseek-chat',
  escalateModel: 'openrouter/qwen/qwen3-coder-plus',
  reviewRuntime: 'pi',
  reviewModel: 'openrouter/qwen/qwen3-coder-plus',
}

describe('user costPresets', () => {
  it('reserves built-in and custom names', () => {
    expect(isReservedCostPresetName('minmax')).toBe(true)
    expect(isReservedCostPresetName('balanced')).toBe(true)
    expect(isReservedCostPresetName('cursor')).toBe(true)
    expect(isReservedCostPresetName('custom')).toBe(true)
    expect(isReservedCostPresetName('cheap-pi')).toBe(false)
  })

  it('rejects reserved and non-kebab user catalog names', () => {
    expect(() => assertUserCostPresetName('minmax')).toThrow(/reserved/)
    expect(() => assertUserCostPresetName('Hy3')).toThrow(/kebab-case/)
    expect(() => assertUserCostPresetName('')).toThrow(/kebab-case/)
    expect(() => assertUserCostPresetName('hy3-dsh')).not.toThrow()
  })

  it('binds a user stack without any detection', () => {
    const stack = resolveUserCostPreset('cheap-pi', { 'cheap-pi': cheapPi })
    expect(stack.runtime).toBe('pi')
    expect(stack.model).toBe('openrouter/deepseek/deepseek-chat')
    expect(stack.escalateModel).toBe('openrouter/qwen/qwen3-coder-plus')
    expect(stack.reviewRuntime).toBe('pi')
    expect(stack.reviewModel).toBe('openrouter/qwen/qwen3-coder-plus')
  })

  it('throws when the user name is missing from the map', () => {
    expect(() => resolveUserCostPreset('nope', {})).toThrow(/not defined in the repo profile/)
  })

  it('throws when the user stack is missing runtime/model', () => {
    expect(() =>
      resolveUserCostPreset('bad', { bad: { runtime: 'pi', model: 'm' } }),
    ).toThrow(/must define runtime, model/)
  })

  it('describeUserCostPresetRaw summarizes the stack', () => {
    expect(describeUserCostPresetRaw(cheapPi)).toMatch(/cheap-pi|saved preset/)
    expect(describeUserCostPresetRaw(cheapPi)).toMatch(/deepseek-chat/)
  })

  it('applyCostPreset fills a user stack without detection', () => {
    const filled = applyCostPreset(
      { verify: 'true', costPreset: 'cheap-pi' },
      emptyDetection(),
      { 'cheap-pi': cheapPi },
    ) as Record<string, unknown>
    expect(filled.runtime).toBe('pi')
    expect(filled.model).toBe('openrouter/deepseek/deepseek-chat')
    expect(filled.reviewRuntime).toBe('pi')
    expect(filled.reviewModel).toBe('openrouter/qwen/qwen3-coder-plus')
    expect(filled.costPreset).toBe('cheap-pi')
  })

  it('applyCostPreset leaves a sparse user preset unresolved when the name is unknown', () => {
    const filled = applyCostPreset(
      { verify: 'true', costPreset: 'nope' },
      emptyDetection(),
      { 'cheap-pi': cheapPi },
    ) as Record<string, unknown>
    expect(filled.runtime).toBeUndefined()
    expect(filled.costPreset).toBe('nope')
  })

  it('applyCostPreset keeps frozen keys over a user preset', () => {
    const frozen = {
      verify: 'true',
      costPreset: 'cheap-pi' as const,
      runtime: 'cursor',
      model: CURSOR_LOOP_MODEL,
      reviewRuntime: 'cursor',
      reviewModel: CURSOR_REVIEW_MODEL,
    }
    expect(() => applyCostPreset(frozen, emptyDetection(), { 'cheap-pi': cheapPi })).not.toThrow()
    const filled = applyCostPreset(frozen, emptyDetection(), { 'cheap-pi': cheapPi }) as Record<
      string,
      unknown
    >
    expect(filled.runtime).toBe('cursor')
    expect(filled.model).toBe(CURSOR_LOOP_MODEL)
    expect(filled.reviewRuntime).toBe('cursor')
    expect(filled.reviewModel).toBe(CURSOR_REVIEW_MODEL)
  })
})

describe('parseLoopConfig user costPreset', () => {
  it('resolves a user name from the costPresets option', () => {
    const parsed = parseLoopConfig(
      { verify: 'true', costPreset: 'cheap-pi' },
      { detection: emptyDetection(), costPresets: { 'cheap-pi': cheapPi } },
    )
    expect(parsed.runtime).toBe('pi')
    expect(parsed.model).toBe('openrouter/deepseek/deepseek-chat')
    expect(parsed.reviewRuntime).toBe('pi')
    expect(parsed.reviewModel).toBe('openrouter/qwen/qwen3-coder-plus')
    expect(parsed.costPreset).toBe('cheap-pi')
  })

  it('rejects a reserved name defined in the costPresets map', () => {
    expect(() =>
      parseLoopConfig(
        { verify: 'true', costPreset: 'minmax' },
        {
          detection: detectionOf({ cursor: 'detected' }),
          costPresets: { minmax: cheapPi },
        },
      ),
    ).toThrow(/reserved/)
  })

  it('fails an unknown costPreset name', () => {
    expect(() =>
      parseLoopConfig(
        { verify: 'true', costPreset: 'nope' },
        { detection: emptyDetection(), costPresets: {} },
      ),
    ).toThrow(/unknown costPreset/)
  })
})

describe('parseCostPresetsCatalog', () => {
  it('rejects a non-kebab catalog key', () => {
    expect(() =>
      parseCostPresetsCatalog({
        Hy3: cheapPi,
      }),
    ).toThrow(/kebab-case/)
  })
})

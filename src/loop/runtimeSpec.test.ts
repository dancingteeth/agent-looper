import { describe, expect, it } from 'vitest'
import {
  CURSOR_LOOP_MODEL,
  CURSOR_REVIEW_MODEL,
  DEFAULT_CLINE_CREDITS_LOOP_MODEL,
  DEFAULT_OPENCODE_GO_LOOP_MODEL,
  LOOP_RUNTIME_CLAUDE,
  LOOP_RUNTIME_CLINE,
  LOOP_RUNTIME_CLINE_PASS,
  LOOP_RUNTIME_CODEX,
  LOOP_RUNTIME_CURSOR,
  LOOP_RUNTIME_DSH,
  LOOP_RUNTIME_MUSE,
  LOOP_RUNTIME_OPENCODE,
  LOOP_RUNTIME_PI,
  LOOP_RUNTIME_VALUES,
} from './modelCatalog.js'
import {
  AgentModelError,
  assertRuntimeModel,
  defaultModelForRuntime,
  defaultReviewModel,
  modelCompatibleWithRuntime,
  reviewModelCompatibleWithRuntime,
  runtimeHonorsReasoningEffort,
  runtimeOffersEscalateModel,
  RUNTIME_SPEC,
} from './runtimeSpec.js'

describe('runtimeSpec', () => {
  it('returns default worker models per runtime', () => {
    expect(defaultModelForRuntime(LOOP_RUNTIME_CURSOR)).toBe(CURSOR_LOOP_MODEL)
    expect(defaultModelForRuntime(LOOP_RUNTIME_OPENCODE)).toBe(DEFAULT_OPENCODE_GO_LOOP_MODEL)
  })

  it('picks Cursor Grok judge only when the worker is also Cursor', () => {
    expect(defaultReviewModel(LOOP_RUNTIME_CURSOR, LOOP_RUNTIME_CURSOR)).toBe(CURSOR_REVIEW_MODEL)
    expect(defaultReviewModel(LOOP_RUNTIME_CURSOR, LOOP_RUNTIME_OPENCODE)).toBe(CURSOR_LOOP_MODEL)
  })

  it('assertRuntimeModel accepts valid worker and review shapes', () => {
    expect(assertRuntimeModel(LOOP_RUNTIME_CURSOR, CURSOR_LOOP_MODEL, 'worker', 'model')).toBe(
      CURSOR_LOOP_MODEL,
    )
    expect(assertRuntimeModel(LOOP_RUNTIME_CURSOR, CURSOR_REVIEW_MODEL, 'review', 'reviewModel')).toBe(
      CURSOR_REVIEW_MODEL,
    )
    expect(assertRuntimeModel(LOOP_RUNTIME_CLINE, DEFAULT_CLINE_CREDITS_LOOP_MODEL, 'worker', 'model')).toBe(
      DEFAULT_CLINE_CREDITS_LOOP_MODEL,
    )
  })

  it('assertRuntimeModel throws AgentModelError with field and hints', () => {
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CURSOR, 'composer-2.5-fast', 'worker', 'model'),
    ).toThrow(AgentModelError)
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CURSOR, 'composer-2.5-fast', 'worker', 'model'),
    ).toThrow(expect.objectContaining({ field: 'model' }))
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CURSOR, 'composer-2.5-fast', 'worker', 'model'),
    ).toThrow(/banned/)

    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CURSOR, 'openai/gpt-4', 'review', 'reviewModel'),
    ).toThrow(/Invalid reviewModel/)
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CURSOR, 'openai/gpt-4', 'worker', 'escalateModel'),
    ).toThrow(/escalateModel/)
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_PI, 'opencode-go/kimi-k3', 'worker', 'model'),
    ).toThrow(/not valid for runtime "pi"/)
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_CLINE, 'cline-pass/foo', 'worker', 'model'),
    ).toThrow(/not valid for runtime "cline"/)
    expect(() =>
      assertRuntimeModel(LOOP_RUNTIME_OPENCODE, 'not-a-provider-model', 'worker', 'model'),
    ).toThrow(/provider\/model/)
  })

  it('exposes reasoning-effort and escalate-model capability flags', () => {
    expect(runtimeHonorsReasoningEffort(LOOP_RUNTIME_CLINE_PASS)).toBe(true)
    expect(runtimeHonorsReasoningEffort(LOOP_RUNTIME_CURSOR)).toBe(false)
    expect(runtimeOffersEscalateModel(LOOP_RUNTIME_MUSE)).toBe(false)
    expect(runtimeOffersEscalateModel(LOOP_RUNTIME_CODEX)).toBe(true)
  })

  it('modelCompatibleWithRuntime treats undefined as compatible', () => {
    expect(modelCompatibleWithRuntime(LOOP_RUNTIME_DSH, undefined)).toBe(true)
    expect(modelCompatibleWithRuntime(LOOP_RUNTIME_CLAUDE, 'not-a-claude-slug')).toBe(false)
  })

  it('rejects clearly invalid worker models for every runtime', () => {
    for (const runtime of LOOP_RUNTIME_VALUES) {
      expect(() => assertRuntimeModel(runtime, '!!!not-a-real-model!!!', 'worker', 'model')).toThrow(
        AgentModelError,
      )
    }
  })

  it('RUNTIME_SPEC exposes default escalate models where offered', () => {
    expect(RUNTIME_SPEC[LOOP_RUNTIME_CODEX].defaultEscalateModel).toBeDefined()
    expect(RUNTIME_SPEC[LOOP_RUNTIME_MUSE].defaultEscalateModel).toBeUndefined()
  })

  it('reviewModelCompatibleWithRuntime allows Cursor judge slugs only', () => {
    expect(reviewModelCompatibleWithRuntime(LOOP_RUNTIME_CURSOR, CURSOR_REVIEW_MODEL)).toBe(true)
    expect(reviewModelCompatibleWithRuntime(LOOP_RUNTIME_CURSOR, 'composer-2.5-fast')).toBe(false)
    expect(reviewModelCompatibleWithRuntime(LOOP_RUNTIME_OPENCODE, DEFAULT_OPENCODE_GO_LOOP_MODEL)).toBe(
      true,
    )
  })
})

import { describe, expect, it } from 'vitest'
import {
  isClinePassModelShape,
  isOpencodeGoModel,
  isOpencodeGoModelShape,
  isOpencodeLoopModel,
  isPiLoopModel,
  parseProviderModel,
  OPENCODE_GO_LOOP_MODELS,
} from '../loop/loopAgentConfig.js'

describe('parseProviderModel', () => {
  it('splits provider and model id', () => {
    expect(parseProviderModel('opencode-go/deepseek-v4-flash')).toEqual({
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
    })
    expect(parseProviderModel('openrouter/deepseek/deepseek-chat')).toEqual({
      providerID: 'openrouter',
      modelID: 'deepseek/deepseek-chat',
    })
    expect(parseProviderModel('vercel/anthropic/claude-sonnet-4')).toEqual({
      providerID: 'vercel',
      modelID: 'anthropic/claude-sonnet-4',
    })
    expect(parseProviderModel('openrouter/minimax/minimax-m3:free')).toEqual({
      providerID: 'openrouter',
      modelID: 'minimax/minimax-m3:free',
    })
  })

  it('rejects malformed ids', () => {
    expect(() => parseProviderModel('deepseek-v4-flash')).toThrow(/Invalid provider\/model/)
    expect(() => parseProviderModel('opencode-go/')).toThrow(/Invalid provider\/model/)
  })
})

describe('isOpencodeLoopModel', () => {
  it('accepts Go curated slugs and BYOK provider/model', () => {
    expect(isOpencodeLoopModel('opencode-go/deepseek-v4-flash')).toBe(true)
    expect(isOpencodeLoopModel('openrouter/deepseek/deepseek-chat')).toBe(true)
    expect(isOpencodeLoopModel('vercel/anthropic/claude-sonnet-4')).toBe(true)
    expect(isOpencodeLoopModel('ollama/llama3.2')).toBe(true)
  })

  it('accepts OpenRouter :free suffixes', () => {
    expect(isOpencodeLoopModel('openrouter/minimax/minimax-m3:free')).toBe(true)
    expect(isOpencodeLoopModel('openrouter/poolside/laguna-s-2.1:free')).toBe(true)
    expect(isPiLoopModel('openrouter/minimax/minimax-m3:free')).toBe(true)
  })

  it('rejects a colon in the provider id', () => {
    expect(isOpencodeLoopModel('open:router/minimax-m3:free')).toBe(false)
  })

  it('accepts well-formed unknown Go slugs and rejects ClinePass ids', () => {
    expect(isOpencodeLoopModel('opencode-go/brand-new-model')).toBe(true)
    expect(isOpencodeLoopModel('cline-pass/deepseek-v4-flash')).toBe(false)
  })

  it('rejects malformed Go and Cline Pass slug shapes', () => {
    expect(isOpencodeGoModelShape('opencode-go/')).toBe(false)
    expect(isOpencodeGoModelShape('opencode-go/a b')).toBe(false)
    expect(isClinePassModelShape('cline-pass/x.y:z')).toBe(true)
    expect(isClinePassModelShape('cline-pass/')).toBe(false)
  })
})

describe('OPENCODE_GO_LOOP_MODELS', () => {
  it('includes defaults used by the harness', () => {
    expect(isOpencodeGoModel('opencode-go/deepseek-v4-flash')).toBe(true)
    expect(isOpencodeGoModel('opencode-go/qwen3.7-plus')).toBe(true)
    expect(OPENCODE_GO_LOOP_MODELS.length).toBeGreaterThan(5)
  })

  it('includes current Go lineup slugs (Hy3, Kimi K3, GLM-5.3, Qwen3.8 Max)', () => {
    expect(OPENCODE_GO_LOOP_MODELS).toContain('opencode-go/grok-4.7')
    expect(OPENCODE_GO_LOOP_MODELS).toContain('opencode-go/hy3')
    expect(OPENCODE_GO_LOOP_MODELS).toContain('opencode-go/kimi-k3')
    expect(OPENCODE_GO_LOOP_MODELS).toContain('opencode-go/glm-5.3')
    expect(OPENCODE_GO_LOOP_MODELS).toContain('opencode-go/qwen3.8-max')
  })
})

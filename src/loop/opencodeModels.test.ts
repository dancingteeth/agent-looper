import { describe, expect, it } from 'vitest'
import {
  isOpencodeGoModel,
  isOpencodeLoopModel,
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
    expect(isOpencodeLoopModel('ollama/llama3.2')).toBe(true)
  })

  it('rejects unknown Go slugs and ClinePass ids', () => {
    expect(isOpencodeLoopModel('opencode-go/not-a-real-model')).toBe(false)
    expect(isOpencodeLoopModel('cline-pass/deepseek-v4-flash')).toBe(false)
  })
})

describe('OPENCODE_GO_LOOP_MODELS', () => {
  it('includes defaults used by the harness', () => {
    expect(isOpencodeGoModel('opencode-go/deepseek-v4-flash')).toBe(true)
    expect(isOpencodeGoModel('opencode-go/qwen3.7-plus')).toBe(true)
    expect(OPENCODE_GO_LOOP_MODELS.length).toBeGreaterThan(5)
  })
})

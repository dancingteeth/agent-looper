import { describe, expect, it } from 'vitest'
import {
  isOpencodeGoModel,
  parseOpencodeGoModel,
  OPENCODE_GO_LOOP_MODELS,
} from '../loop/loopAgentConfig.js'

describe('parseOpencodeGoModel', () => {
  it('splits provider and model id', () => {
    expect(parseOpencodeGoModel('opencode-go/deepseek-v4-flash')).toEqual({
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
    })
  })

  it('rejects malformed ids', () => {
    expect(() => parseOpencodeGoModel('deepseek-v4-flash')).toThrow(/Invalid OpenCode model/)
    expect(() => parseOpencodeGoModel('opencode-go/')).toThrow(/Invalid OpenCode model/)
  })
})

describe('OPENCODE_GO_LOOP_MODELS', () => {
  it('includes defaults used by the harness', () => {
    expect(isOpencodeGoModel('opencode-go/deepseek-v4-flash')).toBe(true)
    expect(isOpencodeGoModel('opencode-go/qwen3.7-plus')).toBe(true)
    expect(OPENCODE_GO_LOOP_MODELS.length).toBeGreaterThan(5)
  })
})

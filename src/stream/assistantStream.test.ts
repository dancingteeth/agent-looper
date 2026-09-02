import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearAssistantStreamSink,
  emitAssistantText,
  notifyAssistantStreamSink,
  setAssistantStreamSink,
} from './assistantStream.js'

describe('emitAssistantText', () => {
  afterEach(() => {
    clearAssistantStreamSink()
    vi.restoreAllMocks()
  })

  it('prefers the callback over stdout', () => {
    const onAssistantText = vi.fn()
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    emitAssistantText({ verbose: true, assistantOutput: 'stdout', onAssistantText }, 'hi')
    expect(onAssistantText).toHaveBeenCalledWith('hi')
    expect(write).not.toHaveBeenCalled()
  })

  it('still notifies the grind sink when a callback is set', () => {
    const sink = vi.fn()
    const onAssistantText = vi.fn()
    setAssistantStreamSink(sink)
    emitAssistantText({ verbose: false, assistantOutput: 'none', onAssistantText }, 'token')
    expect(sink).toHaveBeenCalledWith('token')
    expect(onAssistantText).toHaveBeenCalledWith('token')
  })

  it('notifies the grind sink without writing stdout', () => {
    const sink = vi.fn()
    setAssistantStreamSink(sink)
    notifyAssistantStreamSink('thinking hmm')
    expect(sink).toHaveBeenCalledWith('thinking hmm')
  })

  it('writes stdout when assistantOutput is stdout', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    emitAssistantText({ verbose: false, assistantOutput: 'stdout' }, 'hi')
    expect(write).toHaveBeenCalledWith('hi')
  })

  it('writes stdout when verbose even if assistantOutput is none', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    emitAssistantText({ verbose: true, assistantOutput: 'none' }, 'hi')
    expect(write).toHaveBeenCalledWith('hi')
  })

  it('stays quiet when output is none and not verbose', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    emitAssistantText({ verbose: false, assistantOutput: 'none' }, 'hi')
    expect(write).not.toHaveBeenCalled()
  })
})

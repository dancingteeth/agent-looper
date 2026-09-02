import type { StreamCollector } from './streamCollect.js'

export type AssistantStreamOptions = {
  verbose: boolean
  assistantOutput?: 'stdout' | 'none'
  collector?: StreamCollector
  onAssistantText?: (chunk: string) => void
}

type AssistantStreamSink = (chunk: string) => void

let assistantStreamSink: AssistantStreamSink | undefined

/** Grind watch IPC: `run` installs a loop-dir file appender; Watch tails it. */
export function setAssistantStreamSink(sink: AssistantStreamSink | undefined): void {
  assistantStreamSink = sink
}

export function clearAssistantStreamSink(sink?: AssistantStreamSink): void {
  if (sink !== undefined && assistantStreamSink !== sink) return
  assistantStreamSink = undefined
}

/** File-backed grind tail (thinking / tools / tokens). Does not write stdout. */
export function notifyAssistantStreamSink(text: string): void {
  if (!text) return
  assistantStreamSink?.(text)
}

/** Route assistant text to a callback or stdout (never both). Verbose still dumps when output is none. */
export function emitAssistantText(
  options: Pick<AssistantStreamOptions, 'assistantOutput' | 'onAssistantText'> & {
    verbose?: boolean
  },
  text: string,
): void {
  notifyAssistantStreamSink(text)
  if (options.onAssistantText) {
    options.onAssistantText(text)
    return
  }
  if ((options.assistantOutput ?? 'stdout') === 'stdout' || options.verbose) {
    process.stdout.write(text)
  }
}

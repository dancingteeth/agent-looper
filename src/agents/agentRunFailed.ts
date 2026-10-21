import type { AgentRunResult } from './agentRunResult.js'

export type AgentRunPartialResult = Pick<
  AgentRunResult,
  'usage' | 'toolSummary' | 'transcriptEvents' | 'sessionRef' | 'text'
>

/** Worker/judge session ended before a normal return; may still carry usage from the SDK. */
export class AgentRunFailedError extends Error {
  readonly partial?: AgentRunPartialResult

  constructor(message: string, partial?: AgentRunPartialResult) {
    super(message)
    this.name = 'AgentRunFailedError'
    this.partial = partial
  }
}

export function partialAgentRunFromError(err: unknown): AgentRunPartialResult | undefined {
  if (err instanceof AgentRunFailedError) return err.partial
  return undefined
}

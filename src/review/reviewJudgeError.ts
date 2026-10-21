import { isTransportErrorMessage } from '../agents/errorFormat.js'

export type ReviewJudgeErrorClass = 'timeout' | 'provider' | 'no_tool_calls' | 'other'

/** Classify a thrown judge/review session error for logging and fallback policy. */
export function classifyReviewJudgeError(message: string): ReviewJudgeErrorClass {
  if (/timed out after \d+ms/i.test(message)) return 'timeout'
  if (isTransportErrorMessage(message)) return 'provider'
  if (
    /no tool progress|text stream without tools|without assistant text|empty result|unparseable verdict|no verdict/i.test(
      message,
    )
  ) {
    return 'no_tool_calls'
  }
  return 'other'
}

export function formatReviewJudgeErrorClass(klass: ReviewJudgeErrorClass): string {
  switch (klass) {
    case 'timeout':
      return 'timeout'
    case 'provider':
      return 'provider/API error'
    case 'no_tool_calls':
      return 'text-with-no-tool-calls / no verdict'
    case 'other':
      return 'other'
    default: {
      const _exhaustive: never = klass
      return String(_exhaustive)
    }
  }
}

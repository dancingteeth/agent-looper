export type LoopReviewRisk = 'high' | 'medium' | 'low'

const HIGH_RISK_PATTERN =
  /\b(auth|session|login|oauth|payment|stripe|tbc|bog|flitt|bank|crypto|camel|migration|doppler|secret|privacy|pii|webhook|deploy|run-sql|telegram-bot|access.?control|permission)\b/i

const MEDIUM_RISK_PATTERN =
  /\b(checkout|order|affiliate|commission|integration|etsy|ebay|marketplace|mastra|transformer|dispatch|webhook|payload\.config|ecommerce|payment)\b/i

const LOW_RISK_PATTERN =
  /\b(docs?|readme|validator|scorer|formatting|typo|comment-only|loop harness|agent loop|cursor-sdk|harness)\b/i

export function inferLoopReviewRisk(goal: string, verify: string): LoopReviewRisk {
  const combined = `${goal}\n${verify}`

  if (HIGH_RISK_PATTERN.test(combined)) {
    return 'high'
  }

  if (MEDIUM_RISK_PATTERN.test(combined)) {
    return 'medium'
  }

  if (LOW_RISK_PATTERN.test(combined)) {
    return 'low'
  }

  if (/agent-loop|cursor-sdk/.test(verify)) {
    return 'low'
  }

  return /src\//.test(verify) ? 'medium' : 'low'
}

export type PostQualityReviewSetting = boolean | 'auto'

export function resolvePostQualityReview(
  setting: PostQualityReviewSetting,
  goal: string,
  verify: string,
): boolean {
  if (setting === true) return true
  if (setting === false) return false
  return inferLoopReviewRisk(goal, verify) !== 'low'
}

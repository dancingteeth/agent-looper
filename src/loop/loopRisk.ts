import type { LoopRiskKeywords } from './loopRiskProfile.js'
import {
  DEFAULT_LOOP_RISK_KEYWORDS,
  inferLoopReviewRiskWithProfile,
  type LoopRiskProfileOverride,
} from './loopRiskProfile.js'

export type LoopReviewRisk = 'high' | 'medium' | 'low'

export type PostQualityReviewSetting = boolean | 'auto'

export type LoopRiskInferenceContext = {
  profile?: LoopRiskKeywords
  reviewRisk?: LoopReviewRisk | 'auto'
  loopRiskProfile?: LoopRiskProfileOverride
}

function resolveProfile(ctx?: LoopRiskInferenceContext): LoopRiskKeywords {
  if (ctx?.profile) {
    return ctx.profile
  }
  if (ctx?.loopRiskProfile) {
    return {
      high: [...DEFAULT_LOOP_RISK_KEYWORDS.high, ...(ctx.loopRiskProfile.high ?? [])],
      medium: [...DEFAULT_LOOP_RISK_KEYWORDS.medium, ...(ctx.loopRiskProfile.medium ?? [])],
      low: [...DEFAULT_LOOP_RISK_KEYWORDS.low, ...(ctx.loopRiskProfile.low ?? [])],
    }
  }
  return DEFAULT_LOOP_RISK_KEYWORDS
}

export function inferLoopReviewRisk(
  goal: string,
  verify: string,
  ctx?: LoopRiskInferenceContext,
): LoopReviewRisk {
  return inferLoopReviewRiskWithProfile(goal, verify, {
    profile: resolveProfile(ctx),
    reviewRisk: ctx?.reviewRisk,
  })
}

export function resolvePostQualityReview(
  setting: PostQualityReviewSetting,
  goal: string,
  verify: string,
  ctx?: LoopRiskInferenceContext,
): boolean {
  if (setting === true) return true
  if (setting === false) return false
  return inferLoopReviewRisk(goal, verify, ctx) !== 'low'
}

export function resolveShouldRunQualityReview(
  config: {
    postQualityReview: PostQualityReviewSetting
    reviewGate: boolean
    reviewRisk?: LoopReviewRisk | 'auto'
  },
  goal: string,
  verify: string,
  riskCtx?: LoopRiskInferenceContext,
): boolean {
  if (config.reviewGate) return true
  return resolvePostQualityReview(config.postQualityReview, goal, verify, {
    ...riskCtx,
    reviewRisk: config.reviewRisk,
  })
}

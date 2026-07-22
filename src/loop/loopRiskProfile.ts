import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { RepoContext } from '../context/repoContext.js'
import { loadReviewsMd } from '../review/reviewsMd.js'
import type { LoopReviewRisk } from './loopRisk.js'

export const LOOP_RISK_INFERENCE_SECTION = '## Loop risk inference'

export const loopRiskKeywordsSchema = z.object({
  high: z.array(z.string().trim().min(1)),
  medium: z.array(z.string().trim().min(1)),
  low: z.array(z.string().trim().min(1)),
})

export type LoopRiskKeywords = z.infer<typeof loopRiskKeywordsSchema>

export const loopRiskProfileOverrideSchema = z.object({
  high: z.array(z.string().trim().min(1)).optional(),
  medium: z.array(z.string().trim().min(1)).optional(),
  low: z.array(z.string().trim().min(1)).optional(),
})

export type LoopRiskProfileOverride = z.infer<typeof loopRiskProfileOverrideSchema>

/** Harness defaults when REVIEWS.md / repo profile do not override. */
export const DEFAULT_LOOP_RISK_KEYWORDS: LoopRiskKeywords = {
  high: [
    'auth',
    'session',
    'login',
    'oauth',
    'payment',
    'stripe',
    'bank',
    'crypto',
    'migration',
    'secret',
    'privacy',
    'pii',
    'webhook',
    'deploy',
    'run-sql',
    'telegram-bot',
    'access-control',
    'permission',
  ],
  medium: [
    'checkout',
    'order',
    'affiliate',
    'commission',
    'integration',
    'marketplace',
    'transformer',
    'dispatch',
    'payload.config',
    'ecommerce',
  ],
  low: [
    'docs',
    'readme',
    'validator',
    'scorer',
    'formatting',
    'typo',
    'comment-only',
    'loop harness',
    'agent loop',
    'cursor-sdk',
    'harness',
  ],
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function keywordsToRiskPattern(keywords: string[]): RegExp {
  const parts = keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => `\\b(?:${escapeRegexLiteral(k)})\\b`)
  if (parts.length === 0) {
    return /(?!)/ // never matches
  }
  return new RegExp(parts.join('|'), 'i')
}

function uniqueKeywords(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function mergeKeywordTiers(
  base: LoopRiskKeywords,
  ...overrides: Array<Partial<LoopRiskKeywords> | undefined>
): LoopRiskKeywords {
  let high = [...base.high]
  let medium = [...base.medium]
  let low = [...base.low]

  for (const override of overrides) {
    if (!override) continue
    if (override.high?.length) high = uniqueKeywords([...high, ...override.high])
    if (override.medium?.length) medium = uniqueKeywords([...medium, ...override.medium])
    if (override.low?.length) low = uniqueKeywords([...low, ...override.low])
  }

  return loopRiskKeywordsSchema.parse({ high, medium, low })
}

function parseKeywordBody(body: string): string[] {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('<!--'))

  const tokens: string[] = []
  for (const line of lines) {
    const bullet = line.replace(/^[-*]\s+/, '').trim()
    if (bullet.includes(',')) {
      for (const part of bullet.split(',')) {
        const trimmed = part.trim()
        if (trimmed) tokens.push(trimmed)
      }
    } else if (bullet) {
      tokens.push(bullet)
    }
  }
  return uniqueKeywords(tokens)
}

function parseTierSection(reviewsMd: string, tier: 'HIGH' | 'MEDIUM' | 'LOW'): string[] {
  const sectionRe = new RegExp(
    `###\\s+${tier}\\b([\\s\\S]*?)(?=###\\s+(?:HIGH|MEDIUM|LOW)\\b|##\\s+|$)`,
    'i',
  )
  const match = reviewsMd.match(sectionRe)
  if (!match?.[1]) return []
  return parseKeywordBody(match[1])
}

/** Parse optional `## Loop risk inference` from REVIEWS.md (consumer overlay). */
export function parseLoopRiskKeywordsFromReviewsMd(reviewsMd: string): Partial<LoopRiskKeywords> | null {
  const sectionIdx = reviewsMd.search(/^##\s+Loop risk inference\b/im)
  if (sectionIdx < 0) return null

  const section = reviewsMd.slice(sectionIdx)
  const high = parseTierSection(section, 'HIGH')
  const medium = parseTierSection(section, 'MEDIUM')
  const low = parseTierSection(section, 'LOW')

  if (high.length === 0 && medium.length === 0 && low.length === 0) {
    return null
  }

  return {
    ...(high.length ? { high } : {}),
    ...(medium.length ? { medium } : {}),
    ...(low.length ? { low } : {}),
  }
}

export function formatRiskTierLines(tier: 'HIGH' | 'MEDIUM' | 'LOW', keywords: string[]): string {
  return `${tier}: ${keywords.join(', ')}.`
}

export function buildRiskTriageStepFromKeywords(keywords: LoopRiskKeywords): string {
  return `**Step 1 — Classify risk**
1. **${formatRiskTierLines('HIGH', keywords.high)}**
2. **${formatRiskTierLines('MEDIUM', keywords.medium)}**
3. **${formatRiskTierLines('LOW', keywords.low)}**`
}

export type ResolveLoopRiskProfileOptions = {
  ctx: RepoContext
  loopOverride?: LoopRiskProfileOverride
}

export function resolveLoopRiskKeywords(options: ResolveLoopRiskProfileOptions): LoopRiskKeywords {
  const reviewsMd = loadReviewsMd(options.ctx.repoRoot, options.ctx.profile)
  const fromReviews = parseLoopRiskKeywordsFromReviewsMd(reviewsMd)
  const fromRepo = options.ctx.profile.loopRiskProfile

  return mergeKeywordTiers(DEFAULT_LOOP_RISK_KEYWORDS, fromReviews ?? undefined, fromRepo, options.loopOverride)
}

export type InferLoopReviewRiskOptions = {
  profile: LoopRiskKeywords
  reviewRisk?: LoopReviewRisk | 'auto'
}

export function inferLoopReviewRiskWithProfile(
  goal: string,
  verify: string,
  options: InferLoopReviewRiskOptions,
): LoopReviewRisk {
  if (options.reviewRisk && options.reviewRisk !== 'auto') {
    return options.reviewRisk
  }

  const combined = `${goal}\n${verify}`
  const { profile } = options

  if (keywordsToRiskPattern(profile.high).test(combined)) {
    return 'high'
  }
  if (keywordsToRiskPattern(profile.medium).test(combined)) {
    return 'medium'
  }
  if (keywordsToRiskPattern(profile.low).test(combined)) {
    return 'low'
  }

  if (/\bagent-loop\b|\bcursor-sdk\b/i.test(verify)) {
    return 'low'
  }

  return /src\//.test(verify) ? 'medium' : 'low'
}

export function loadLoopRiskProfileFromRepo(repoRoot: string, profilePath?: string): LoopRiskProfileOverride | undefined {
  const resolved = profilePath
    ? path.isAbsolute(profilePath)
      ? profilePath
      : path.join(repoRoot, profilePath)
    : undefined
  if (!resolved || !fs.existsSync(resolved)) {
    return undefined
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8')) as unknown
  return loopRiskProfileOverrideSchema.parse(raw)
}

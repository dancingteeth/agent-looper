import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { taskwarriorProjectSchema } from '../integrations/taskwarrior.js'
import { hitlProfileFieldsSchema } from '../integrations/hitlConfig.js'
import { pickLoopDefaults } from '../loop/loopDefaults.js'
import { loopRiskProfileOverrideSchema } from '../loop/loopRiskProfile.js'
import { userCostPresetsCatalogSchema } from '../loop/costPreset.js'

export const REPO_PROFILE_RELATIVE_PATH = path.join('.cursor', 'agent-loop.repo.json')

export const repoProfileSchema = z
  .object({
    /** Taskwarrior project for HITL checkpoints (e.g. dxp, zwook). Required when hitlProvider is taskwarrior. */
    taskwarriorProject: taskwarriorProjectSchema.optional(),
  /** Shell command to mirror TW after success; null = skip. */
  syncCommand: z.string().trim().min(1).nullable().default(null),
  /**
   * Optional shell after every loop/batch exit (success, incomplete, or fatal).
   * Receives LOOP_* env — useful for Slack/Discord webhooks when Telegram is off
   * (especially Cloud Agents). Loop/batch `notifyCommand` overrides this.
   */
  notifyCommand: z.string().trim().min(1).optional(),
  /**
   * Structured webhook (JSON POST). URL from `url` or AGENT_LOOP_NOTIFY_WEBHOOK_URL.
   * Prefer this over notifyCommand for Slack/Discord on Cloud Agents.
   */
  notifyWebhook: z
    .object({
      url: z.string().trim().min(1).optional(),
      onSuccess: z.boolean().default(true),
      onFailure: z.boolean().default(true),
    })
    .optional(),
  /**
   * After each CLI exit, comment on the open PR for this branch
   * (or AGENT_LOOP_PR_NUMBER). Uses `gh pr comment`.
   */
  notifyPrComment: z.boolean().default(false),
  /** Base branch for post-loop diff stat. */
  defaultBranch: z.string().trim().min(1).default('main'),
  agentsFile: z.string().trim().min(1).default('AGENTS.md'),
  reviewsFile: z.string().trim().min(1).default('REVIEWS.md'),
  skillsGlob: z.string().trim().min(1).default('packages/skills/*/SKILL.md'),
  /** Cline clientName / dispose reason label. */
  clientName: z.string().trim().min(1).default('@dancingteeth/agent-looper'),
  /** Extra keywords merged into loop risk inference (see REVIEWS.md ## Loop risk inference). */
  loopRiskProfile: loopRiskProfileOverrideSchema.optional(),
  /** Optional Telegram completion reports (bot token via env). */
  telegramNotify: z
    .object({
      /** Target chat id — override with AGENT_LOOP_TELEGRAM_CHAT_ID. */
      chatId: z.string().trim().min(1).optional(),
      onSuccess: z.boolean().default(true),
      onFailure: z.boolean().default(true),
      /** Send latest review.md as a Telegram document after the completion summary. */
      attachReview: z.boolean().default(true),
    })
    .optional(),
  /**
   * Default loop.json fields for this repo (runtime, models, review, notify, …).
   * Merged under each bundle’s loop.json at load; loop.json wins. Do not put
   * verify / verifySkill / finalVerify / taskwarriorUuid here.
   */
  defaults: z
    .record(z.string(), z.unknown())
    .optional()
    .transform((value) => {
      if (!value) return undefined
      const picked = pickLoopDefaults(value)
      return Object.keys(picked).length > 0 ? picked : undefined
    }),
  /**
   * User-authored named cost stacks (name → worker/judge stack). Selected from
   * loop.json `"costPreset": "<name>"`. Sibling of `defaults` — this is a catalog,
   * not a loop-field overlay. Built-in names (minmax/balanced/cursor/custom) are
   * reserved; keys must be kebab-case; each value is a worker/judge stack.
   */
  costPresets: userCostPresetsCatalogSchema.optional(),
  })
  .merge(hitlProfileFieldsSchema)

export type RepoProfile = z.infer<typeof repoProfileSchema>

export const DEFAULT_REPO_PROFILE: RepoProfile = repoProfileSchema.parse({})

export function repoProfilePath(repoRoot: string): string {
  return path.join(repoRoot, REPO_PROFILE_RELATIVE_PATH)
}

export function loadRepoProfile(repoRoot: string): RepoProfile {
  const profilePath = repoProfilePath(repoRoot)
  if (!fs.existsSync(profilePath)) {
    return { ...DEFAULT_REPO_PROFILE }
  }

  const raw = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as unknown
  return repoProfileSchema.parse(raw)
}

/**
 * Walk from `startDir` toward filesystem root. Use the first
 * `.cursor/agent-loop.repo.json` found. Stop at a `.git` directory if no
 * profile was found (do not inherit a parent repo or home profile).
 */
export function findRepoRootWithProfile(startDir: string): string | undefined {
  let dir = path.resolve(startDir)
  for (;;) {
    if (fs.existsSync(repoProfilePath(dir))) return dir
    if (fs.existsSync(path.join(dir, '.git'))) return undefined
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** Profile `defaults` for a loop directory, or undefined when none apply. */
export function loadLoopDefaultsForDir(loopDir: string): Record<string, unknown> | undefined {
  const repoRoot = findRepoRootWithProfile(loopDir)
  if (!repoRoot) return undefined
  const defaults = loadRepoProfile(repoRoot).defaults
  if (!defaults || Object.keys(defaults).length === 0) return undefined
  return defaults
}

/** Profile `costPresets` catalog for a loop directory, or undefined when none apply. */
export function loadLoopCostPresetsForDir(loopDir: string): Record<string, unknown> | undefined {
  const repoRoot = findRepoRootWithProfile(loopDir)
  if (!repoRoot) return undefined
  const costPresets = loadRepoProfile(repoRoot).costPresets
  if (!costPresets || Object.keys(costPresets).length === 0) return undefined
  return costPresets
}

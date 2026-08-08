import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { taskwarriorProjectSchema } from '../integrations/taskwarrior.js'
import { hitlProfileFieldsSchema } from '../integrations/hitlConfig.js'
import { loopRiskProfileOverrideSchema } from '../loop/loopRiskProfile.js'

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

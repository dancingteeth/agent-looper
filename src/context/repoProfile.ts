import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { taskwarriorProjectSchema } from '../integrations/taskwarrior.js'

export const REPO_PROFILE_RELATIVE_PATH = path.join('.cursor', 'agent-loop.repo.json')

export const repoProfileSchema = z.object({
  /** Taskwarrior project for HITL checkpoints (e.g. dxp, zwook). */
  taskwarriorProject: taskwarriorProjectSchema.default('dxp'),
  /** Shell command to mirror TW after success; null = skip. */
  syncCommand: z.string().trim().min(1).nullable().default(null),
  /** Base branch for post-loop diff stat. */
  defaultBranch: z.string().trim().min(1).default('main'),
  agentsFile: z.string().trim().min(1).default('AGENTS.md'),
  reviewsFile: z.string().trim().min(1).default('REVIEWS.md'),
  skillsGlob: z.string().trim().min(1).default('packages/skills/*/SKILL.md'),
  /** Cline clientName / dispose reason label. */
  clientName: z.string().trim().min(1).default('@dancingteeth/agent-loop'),
})

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

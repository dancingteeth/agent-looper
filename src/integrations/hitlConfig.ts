import { z } from 'zod'
import type { RepoProfile } from '../context/repoProfile.js'
import { taskwarriorProjectSchema } from './taskwarrior.js'

export const HITL_PROVIDER_TASKWARRIOR = 'taskwarrior' as const
export const HITL_PROVIDER_FILE = 'file' as const
export const HITL_PROVIDER_GITHUB = 'github' as const
export const HITL_PROVIDER_LINEAR = 'linear' as const
export const HITL_PROVIDER_COMMAND = 'command' as const

export const hitlProviderSchema = z.enum([
  HITL_PROVIDER_TASKWARRIOR,
  HITL_PROVIDER_FILE,
  HITL_PROVIDER_GITHUB,
  HITL_PROVIDER_LINEAR,
  HITL_PROVIDER_COMMAND,
])

export type HitlProvider = z.infer<typeof hitlProviderSchema>

export const hitlCheckpointReasonSchema = z.enum([
  'post_success',
  'review_gate',
  'loop_failure',
  'notify_failed',
  'budget',
])

export type HitlCheckpointReason = z.infer<typeof hitlCheckpointReasonSchema>

export const hitlProfileFieldsSchema = z.object({
  hitlProvider: hitlProviderSchema.default(HITL_PROVIDER_TASKWARRIOR),
  hitlFileDir: z.string().trim().min(1).default('.cursor/hitl'),
  hitlCommand: z.string().trim().min(1).optional(),
  hitlLinearTeam: z.string().trim().min(1).optional(),
})

export const hitlLoopOverridesSchema = z.object({
  hitlProvider: hitlProviderSchema.optional(),
  hitlFileDir: z.string().trim().min(1).optional(),
  hitlCommand: z.string().trim().min(1).optional(),
  hitlLinearTeam: z.string().trim().min(1).optional(),
  taskwarriorProject: taskwarriorProjectSchema.optional(),
})

export type HitlLoopOverrides = z.infer<typeof hitlLoopOverridesSchema>

export type ResolvedHitlConfig = {
  provider: HitlProvider
  hitlFileDir: string
  hitlCommand?: string
  hitlLinearTeam?: string
}

export function resolveHitlConfig(
  overrides: HitlLoopOverrides | undefined,
  profile: Pick<
    RepoProfile,
    'hitlProvider' | 'hitlFileDir' | 'hitlCommand' | 'hitlLinearTeam'
  >,
): ResolvedHitlConfig {
  return {
    provider: overrides?.hitlProvider ?? profile.hitlProvider,
    hitlFileDir: overrides?.hitlFileDir ?? profile.hitlFileDir,
    hitlCommand: overrides?.hitlCommand ?? profile.hitlCommand,
    hitlLinearTeam: overrides?.hitlLinearTeam ?? profile.hitlLinearTeam,
  }
}

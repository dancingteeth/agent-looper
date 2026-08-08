import { describe, expect, it } from 'vitest'
import { repoProfileSchema } from '../context/repoProfile.js'
import {
  HITL_PROVIDER_FILE,
  HITL_PROVIDER_TASKWARRIOR,
  resolveHitlConfig,
} from './hitlConfig.js'

describe('resolveHitlConfig', () => {
  const profile = repoProfileSchema.parse({
    hitlProvider: HITL_PROVIDER_TASKWARRIOR,
    hitlFileDir: '.cursor/hitl',
  })

  it('uses profile defaults when overrides omitted', () => {
    expect(resolveHitlConfig(undefined, profile)).toEqual({
      provider: HITL_PROVIDER_TASKWARRIOR,
      hitlFileDir: '.cursor/hitl',
      hitlCommand: undefined,
      hitlLinearTeam: undefined,
    })
  })

  it('lets loop overrides win over profile', () => {
    expect(
      resolveHitlConfig(
        { hitlProvider: HITL_PROVIDER_FILE, hitlFileDir: 'hitl-out', hitlCommand: 'echo ok' },
        profile,
      ),
    ).toEqual({
      provider: HITL_PROVIDER_FILE,
      hitlFileDir: 'hitl-out',
      hitlCommand: 'echo ok',
      hitlLinearTeam: undefined,
    })
  })
})

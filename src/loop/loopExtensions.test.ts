import { describe, expect, it } from 'vitest'
import { loopConfigSchema } from './loopConfig.js'
import {
  detectExternalVerifierPaths,
  validateLoopExtensionPreflight,
} from './loopExtensions.js'
import { repoProfileSchema } from '../context/repoProfile.js'

describe('loop extension schema', () => {
  it('accepts reserved extension fields on loop.json', () => {
    const parsed = loopConfigSchema.parse({
      verify: 'pnpm test',
      smokeScripts: ['bash -n ops/publish.sh'],
      siblingRepos: [{ path: '../aeo-research-ingest', label: 'ingest' }],
      verifyPreflight: 'test -d ../aeo-research-ingest',
      verifyLogMode: 'sidecar',
    })
    expect(parsed.smokeScripts).toHaveLength(1)
    expect(parsed.siblingRepos?.[0]?.path).toBe('../aeo-research-ingest')
    expect(parsed.verifyLogMode).toBe('sidecar')
  })
})

describe('detectExternalVerifierPaths', () => {
  it('flags sibling paths referenced in verify', () => {
    const repoRoot = '/Users/me/Projects/aeogeo.site'
    const paths = detectExternalVerifierPaths(
      'test -f ../aeo-research-ingest/scripts/foo.rb && pnpm test',
      repoRoot,
    )
    expect(paths.some((p) => p.includes('aeo-research-ingest'))).toBe(true)
  })

  it('ignores in-repo relative paths', () => {
    const repoRoot = process.cwd()
    const paths = detectExternalVerifierPaths('pnpm test && test -f packages/foo/bar.ts', repoRoot)
    expect(paths).toHaveLength(0)
  })
})

describe('validateLoopExtensionPreflight', () => {
  it('notes pending features and warns on missing sibling path', () => {
    const config = loopConfigSchema.parse({
      verify: 'pnpm test',
      smokeScripts: ['true'],
      siblingRepos: [{ path: '../definitely-missing-sibling-repo-xyz' }],
    })
    const result = validateLoopExtensionPreflight(
      { repoRoot: process.cwd(), profile: repoProfileSchema.parse({}) },
      config,
    )
    expect(result.pendingFeatures.some((f) => f.includes('smokeScripts'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('siblingRepos path missing'))).toBe(true)
  })
})

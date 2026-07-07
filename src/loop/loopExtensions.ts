import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { RepoContext } from '../context/repoContext.js'
import type { LoopConfig } from './loopConfig.js'
import type { VerifyResult } from './loopVerify.js'

export const verifyLogModeSchema = z.enum(['inline', 'sidecar']).default('inline')
export type VerifyLogMode = z.infer<typeof verifyLogModeSchema>

export const siblingRepoSchema = z.object({
  path: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  verify: z.string().trim().min(1).optional(),
})

export type SiblingRepoRef = z.infer<typeof siblingRepoSchema>

/** Optional loop.json fields — validated at load; hooks execute when implemented. */
export const loopExtensionFieldsSchema = z.object({
  smokeScripts: z.array(z.string().trim().min(1)).optional(),
  siblingRepos: z.array(siblingRepoSchema).optional(),
  verifyPreflight: z.string().trim().min(1).optional(),
  verifyLogMode: verifyLogModeSchema,
})

export type VerifyLogRefs = {
  stdoutPath?: string
  stderrPath?: string
}

export type LoopExtensionPreflightResult = {
  warnings: string[]
  pendingFeatures: string[]
}

const EXTERNAL_PATH_PATTERN =
  /(?:^|[\s"'`(])(\.\.\/[^"'`\s]+|\/(?:Users|home|var|tmp|opt)[^"'`\s]*|[A-Za-z]:\\[^"'`\s]+)/g

export function detectExternalVerifierPaths(verify: string, repoRoot: string): string[] {
  const repoResolved = path.resolve(repoRoot)
  const matches = [...verify.matchAll(EXTERNAL_PATH_PATTERN)].map((m) => m[1]!)
  const external = matches
    .map((segment) => (path.isAbsolute(segment) ? segment : path.resolve(repoRoot, segment)))
    .filter((resolved) => {
      const normalized = path.resolve(resolved)
      return normalized !== repoResolved && !normalized.startsWith(`${repoResolved}${path.sep}`)
    })
  return [...new Set(external)]
}

export function validateLoopExtensionPreflight(
  ctx: RepoContext,
  config: LoopConfig,
): LoopExtensionPreflightResult {
  const warnings: string[] = []
  const pendingFeatures: string[] = []

  if (config.smokeScripts?.length) {
    pendingFeatures.push(`smokeScripts (${config.smokeScripts.length} command(s))`)
  }

  if (config.siblingRepos?.length) {
    pendingFeatures.push(`siblingRepos (${config.siblingRepos.length} repo(s))`)
    for (const sibling of config.siblingRepos) {
      const resolved = path.isAbsolute(sibling.path)
        ? sibling.path
        : path.resolve(ctx.repoRoot, sibling.path)
      if (!fs.existsSync(resolved)) {
        warnings.push(
          `siblingRepos path missing on disk: ${sibling.path} → ${resolved}`,
        )
      }
    }
  }

  if (config.verifyPreflight) {
    pendingFeatures.push('verifyPreflight')
  }

  if (config.verifyLogMode === 'sidecar') {
    pendingFeatures.push('verifyLogMode:sidecar')
  }

  const externalPaths = [
    ...detectExternalVerifierPaths(config.verify, ctx.repoRoot),
    ...(config.finalVerify
      ? detectExternalVerifierPaths(config.finalVerify, ctx.repoRoot)
      : []),
  ]
  const uniqueExternal = [...new Set(externalPaths)]
  if (uniqueExternal.length > 0 && !config.verifyPreflight) {
    warnings.push(
      `verify references paths outside repo (${uniqueExternal.join(', ')}) — add verifyPreflight when CI/local parity matters`,
    )
  }

  return { warnings, pendingFeatures }
}

export function formatLoopExtensionPreflight(result: LoopExtensionPreflightResult): string {
  const lines: string[] = []
  for (const warning of result.warnings) {
    lines.push(`  warn: ${warning}`)
  }
  for (const feature of result.pendingFeatures) {
    lines.push(`  note: ${feature} configured — pipeline hook reserved (not executed yet)`)
  }
  return lines.join('\n')
}

/** Persist verify stdout/stderr. Sidecar mode is reserved for a follow-up hook. */
export function persistVerifyOutput(
  loopDir: string,
  iteration: number,
  verify: VerifyResult,
  mode: VerifyLogMode,
): { verify: VerifyResult; verifyLog?: VerifyLogRefs } {
  if (mode !== 'sidecar') {
    return { verify }
  }

  void loopDir
  void iteration
  console.error(
    '[agent-loop] verifyLogMode=sidecar is reserved — keeping inline verify output until sidecar hook ships',
  )
  return { verify }
}

/** Post-verifier extension hook (smokeScripts). Reserved — logs and skips. */
export function runPostVerifierExtensionHooks(config: LoopConfig, repoRoot: string): void {
  if (!config.smokeScripts?.length) return

  void repoRoot
  console.error(
    `[agent-loop] smokeScripts configured (${config.smokeScripts.length}) — post-verifier hook reserved, not executed yet`,
  )
}

export function siblingReposForIterationLog(config: LoopConfig): SiblingRepoRef[] | undefined {
  if (!config.siblingRepos?.length) return undefined
  return config.siblingRepos
}

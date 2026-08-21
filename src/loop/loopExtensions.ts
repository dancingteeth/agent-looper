import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { RepoContext } from '../context/repoContext.js'
import type { LoopConfig } from './loopConfig.js'
import type { VerifyResult } from './loopVerify.js'

export const verifyLogModeSchema = z.enum(['inline', 'sidecar']).default('inline')
export type VerifyLogMode = z.infer<typeof verifyLogModeSchema>

export const SKILL_DISCLOSURE_INDEX = 'index' as const
export const SKILL_DISCLOSURE_INLINE = 'inline' as const
export const skillDisclosureSchema = z
  .enum([SKILL_DISCLOSURE_INDEX, SKILL_DISCLOSURE_INLINE])
  .default(SKILL_DISCLOSURE_INDEX)
export type SkillDisclosure = z.infer<typeof skillDisclosureSchema>

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
  /** Skill runbooks from GOAL.md / this array (see `skillDisclosure`). */
  skills: z.array(z.string().trim().min(1)).optional(),
  /**
   * Agent Plugins package roots (dirs with plugin.json). Discovers immediate child
   * skill directories (SKILL.md) and indexes them (or inlines when
   * `skillDisclosure` is `inline`). MCP is ignored (worker-owned).
   * See https://agent-plugins.org/client-implementers
   */
  plugins: z.array(z.string().trim().min(1)).optional(),
  /**
   * How verify stdout/stderr reach the next worker prompt.
   * Default `inline` pastes the capture. Optional `sidecar` writes
   * `<loop-dir>/verify-logs/` and pastes a preview + path.
   */
  verifyLogMode: verifyLogModeSchema,
  /**
   * How skill runbooks reach the worker prompt.
   * Default `index` is name + description + path (Read on demand).
   * `inline` pastes full SKILL.md bodies (tiny loops).
   */
  skillDisclosure: skillDisclosureSchema,
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

  if (config.plugins?.length) {
    for (const pluginRoot of config.plugins) {
      const resolved = path.isAbsolute(pluginRoot)
        ? pluginRoot
        : path.resolve(ctx.repoRoot, pluginRoot)
      if (!fs.existsSync(resolved)) {
        warnings.push(`plugins path missing on disk: ${pluginRoot} → ${resolved}`)
      } else if (!fs.existsSync(path.join(resolved, 'plugin.json'))) {
        warnings.push(`plugins path missing plugin.json: ${pluginRoot}`)
      }
    }
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

export const VERIFY_SIDECAR_DIR = 'verify-logs'
export const VERIFY_SIDECAR_PREVIEW_MAX = 600

export type VerifySidecarStem = 'verify' | 'final'

function sidecarPreview(text: string, filePath: string): string {
  const pointer = `[full output: ${filePath}]`
  const trimmed = text.trim()
  if (trimmed.length === 0) return pointer
  if (trimmed.length <= VERIFY_SIDECAR_PREVIEW_MAX) return `${trimmed}\n${pointer}`
  return `${trimmed.slice(0, VERIFY_SIDECAR_PREVIEW_MAX - 1)}…\n${pointer}`
}

/** Persist verify stdout/stderr. Sidecar mode writes files and returns a prompt preview. */
export function persistVerifyOutput(
  loopDir: string,
  iteration: number,
  verify: VerifyResult,
  mode: VerifyLogMode,
  stem: VerifySidecarStem = 'verify',
): { verify: VerifyResult; verifyLog?: VerifyLogRefs } {
  if (mode !== 'sidecar') {
    return { verify }
  }

  const dir = path.join(loopDir, VERIFY_SIDECAR_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const stdoutPath = path.join(dir, `iter-${iteration}.${stem}.stdout.txt`)
  const stderrPath = path.join(dir, `iter-${iteration}.${stem}.stderr.txt`)
  fs.writeFileSync(stdoutPath, verify.stdout, 'utf8')
  fs.writeFileSync(stderrPath, verify.stderr, 'utf8')
  return {
    verify: {
      ...verify,
      stdout: sidecarPreview(verify.stdout, stdoutPath),
      stderr: sidecarPreview(verify.stderr, stderrPath),
    },
    verifyLog: { stdoutPath, stderrPath },
  }
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

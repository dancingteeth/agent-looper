import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

/** Canonical Agent Plugins 1.0.0 manifest schema id — validated locally, never fetched. */
export const AGENT_PLUGINS_PLUGIN_SCHEMA_ID =
  'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json' as const

const PLUGIN_NAME_RE = /^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/

const authorSchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    url: z.string().optional(),
  })
  .strict()

const pluginManifestKnownSchema = z.object({
  $schema: z.literal(AGENT_PLUGINS_PLUGIN_SCHEMA_ID),
  name: z.string().min(1).max(64).regex(PLUGIN_NAME_RE),
  version: z.string().optional(),
  description: z.string().optional(),
  author: authorSchema.optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  extensions: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
})

export type AgentPluginManifest = z.infer<typeof pluginManifestKnownSchema>

export type LoadedAgentPlugin = {
  root: string
  manifest: AgentPluginManifest
  /** Absolute paths to discovered SKILL.md files (within plugin root). */
  skillAbsolutePaths: string[]
  /** Paths relative to repoRoot for prompt inlining. */
  skillRelativePaths: string[]
  warnings: string[]
}

function resolveWithinRoot(root: string, candidate: string): string | undefined {
  const rootResolved = fs.realpathSync(path.resolve(root))
  let target: string
  try {
    target = fs.realpathSync(path.resolve(candidate))
  } catch {
    return undefined
  }
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${path.sep}`)) {
    return undefined
  }
  return target
}

/**
 * Validate Agent Plugins 1.0.0 `plugin.json` without fetching schemas.
 * Unknown top-level fields are reported and ignored (non-fatal).
 * Non-object `extensions` is ignored (non-fatal).
 */
export function parseAgentPluginManifest(
  raw: unknown,
): { ok: true; manifest: AgentPluginManifest; warnings: string[] } | { ok: false; error: string } {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'plugin.json must be a JSON object' }
  }

  const record = { ...(raw as Record<string, unknown>) }
  const warnings: string[] = []

  const knownKeys = new Set([
    '$schema',
    'name',
    'version',
    'description',
    'author',
    'homepage',
    'repository',
    'license',
    'keywords',
    'extensions',
  ])
  for (const key of Object.keys(record)) {
    if (!knownKeys.has(key)) {
      warnings.push(`ignored unknown top-level field "${key}"`)
      delete record[key]
    }
  }

  if ('extensions' in record && (record.extensions === null || typeof record.extensions !== 'object' || Array.isArray(record.extensions))) {
    warnings.push('ignored non-object extensions field')
    delete record.extensions
  }

  const parsed = pluginManifestKnownSchema.safeParse(record)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; '),
    }
  }

  return { ok: true, manifest: parsed.data, warnings }
}

/**
 * Discover immediate child skill directories under `skills/` (Agent Plugins §6–§7.1).
 * Does not recurse. Missing `skills/` is valid absence.
 */
export function discoverAgentPluginSkillPaths(pluginRoot: string): {
  absolutePaths: string[]
  warnings: string[]
} {
  const warnings: string[] = []
  const skillsDir = path.join(pluginRoot, 'skills')
  if (!fs.existsSync(skillsDir)) {
    return { absolutePaths: [], warnings }
  }

  let skillsStat: fs.Stats
  try {
    skillsStat = fs.lstatSync(skillsDir)
  } catch {
    return { absolutePaths: [], warnings: [`skills path unreadable`] }
  }

  if (!skillsStat.isDirectory()) {
    warnings.push('skills exists but is not a directory — treating skills as invalid')
    return { absolutePaths: [], warnings }
  }

  const contained = resolveWithinRoot(pluginRoot, skillsDir)
  if (!contained) {
    warnings.push('skills path escapes plugin root — treating skills as invalid')
    return { absolutePaths: [], warnings }
  }

  const absolutePaths: string[] = []
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const skillMd = path.join(skillsDir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillMd) || !fs.statSync(skillMd).isFile()) continue
    const skillContained = resolveWithinRoot(pluginRoot, skillMd)
    if (!skillContained) {
      warnings.push(`skipped skill "${entry.name}" — SKILL.md escapes plugin root`)
      continue
    }
    absolutePaths.push(skillContained)
  }

  return { absolutePaths, warnings }
}

/**
 * Load one Agent Plugins package from a directory (skills-only client).
 * MCP (`mcp.json`) is intentionally ignored — worker runtimes own MCP.
 */
export function loadAgentPlugin(pluginRootInput: string, repoRoot: string): LoadedAgentPlugin {
  const warnings: string[] = []
  const pluginRoot = path.resolve(pluginRootInput)
  if (!fs.existsSync(pluginRoot) || !fs.statSync(pluginRoot).isDirectory()) {
    throw new Error(`plugin root is not a directory: ${pluginRootInput}`)
  }

  const manifestPath = path.join(pluginRoot, 'plugin.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`missing plugin.json in ${pluginRootInput}`)
  }

  const manifestContained = resolveWithinRoot(pluginRoot, manifestPath)
  if (!manifestContained) {
    throw new Error(`plugin.json escapes plugin root: ${pluginRootInput}`)
  }

  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(manifestContained, 'utf8'))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`invalid plugin.json JSON in ${pluginRootInput}: ${message}`)
  }

  const parsed = parseAgentPluginManifest(raw)
  if (!parsed.ok) {
    throw new Error(`invalid plugin.json in ${pluginRootInput}: ${parsed.error}`)
  }
  warnings.push(...parsed.warnings)

  const discovered = discoverAgentPluginSkillPaths(pluginRoot)
  warnings.push(...discovered.warnings)

  let repoResolved: string
  try {
    repoResolved = fs.realpathSync(path.resolve(repoRoot))
  } catch {
    repoResolved = path.resolve(repoRoot)
  }
  const skillRelativePaths = discovered.absolutePaths.map((abs) => {
    const rel = path.relative(repoResolved, abs)
    return rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel
  })

  return {
    root: pluginRoot,
    manifest: parsed.manifest,
    skillAbsolutePaths: discovered.absolutePaths,
    skillRelativePaths,
    warnings,
  }
}

/**
 * Load all configured plugin roots; collect skill relative paths for prompt inlining.
 * Failed plugins are skipped with stderr-ready warning strings (fail-open per plugin).
 */
export function loadConfiguredAgentPlugins(
  repoRoot: string,
  pluginRoots: string[] | undefined,
): {
  skillRelativePaths: string[]
  warnings: string[]
  plugins: LoadedAgentPlugin[]
} {
  if (!pluginRoots?.length) {
    return { skillRelativePaths: [], warnings: [], plugins: [] }
  }

  const warnings: string[] = []
  const plugins: LoadedAgentPlugin[] = []
  const skillRelativePaths: string[] = []

  for (const entry of pluginRoots) {
    const resolved = path.isAbsolute(entry) ? entry : path.resolve(repoRoot, entry)
    try {
      const loaded = loadAgentPlugin(resolved, repoRoot)
      plugins.push(loaded)
      skillRelativePaths.push(...loaded.skillRelativePaths)
      for (const w of loaded.warnings) {
        warnings.push(`plugin "${loaded.manifest.name}": ${w}`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warnings.push(`skipped plugin "${entry}": ${message}`)
    }
  }

  return {
    skillRelativePaths: [...new Set(skillRelativePaths)],
    warnings,
    plugins,
  }
}

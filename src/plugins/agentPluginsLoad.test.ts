import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
  discoverAgentPluginSkillPaths,
  loadAgentPlugin,
  loadConfiguredAgentPlugins,
  parseAgentPluginManifest,
} from './agentPluginsLoad.js'

const tmpRoots: string[] = []

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tmpRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tmpRoots.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function writePlugin(
  root: string,
  manifest: Record<string, unknown>,
  skills: Array<{ name: string; body?: string }> = [],
): void {
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  for (const skill of skills) {
    const skillDir = path.join(root, 'skills', skill.name)
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(
      path.join(skillDir, 'SKILL.md'),
      skill.body ??
        `---\nname: ${skill.name}\ndescription: test\n---\n\n# ${skill.name}\n`,
    )
  }
}

describe('parseAgentPluginManifest', () => {
  it('accepts a minimal valid manifest', () => {
    const parsed = parseAgentPluginManifest({
      $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
      name: 'demo-plugin',
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.manifest.name).toBe('demo-plugin')
    expect(parsed.warnings).toEqual([])
  })

  it('rejects missing $schema and invalid names; ignores unknown fields', () => {
    expect(
      parseAgentPluginManifest({
        name: 'demo',
      }).ok,
    ).toBe(false)

    expect(
      parseAgentPluginManifest({
        $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
        name: 'Bad_Name',
      }).ok,
    ).toBe(false)

    const withUnknown = parseAgentPluginManifest({
      $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
      name: 'ok-plugin',
      marketplace: { id: 'x' },
    })
    expect(withUnknown.ok).toBe(true)
    if (!withUnknown.ok) return
    expect(withUnknown.warnings.some((w) => w.includes('marketplace'))).toBe(true)
  })
})

describe('discoverAgentPluginSkillPaths', () => {
  it('finds immediate skills/*/SKILL.md only', () => {
    const root = makeTempDir('agent-plugins-skills-')
    writePlugin(
      root,
      { $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID, name: 'skillful' },
      [{ name: 'alpha' }, { name: 'beta' }],
    )
    fs.mkdirSync(path.join(root, 'skills', 'nested', 'deeper'), { recursive: true })
    fs.writeFileSync(path.join(root, 'skills', 'nested', 'deeper', 'SKILL.md'), '# no')

    const discovered = discoverAgentPluginSkillPaths(root)
    expect(discovered.absolutePaths).toHaveLength(2)
    expect(discovered.absolutePaths.some((p) => p.includes(`${path.sep}alpha${path.sep}`))).toBe(
      true,
    )
  })

  it('treats missing skills/ as valid absence', () => {
    const root = makeTempDir('agent-plugins-noskills-')
    writePlugin(root, { $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID, name: 'empty-skills' })
    const discovered = discoverAgentPluginSkillPaths(root)
    expect(discovered.absolutePaths).toEqual([])
    expect(discovered.warnings).toEqual([])
  })
})

describe('loadAgentPlugin / loadConfiguredAgentPlugins', () => {
  it('loads skills and returns repo-relative paths', () => {
    const repo = makeTempDir('agent-plugins-repo-')
    const pluginRoot = path.join(repo, 'plugins', 'demo')
    writePlugin(
      pluginRoot,
      {
        $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID,
        name: 'demo',
        description: 'demo plugin',
      },
      [{ name: 'hello-verify' }],
    )

    const loaded = loadAgentPlugin(pluginRoot, repo)
    expect(loaded.manifest.name).toBe('demo')
    expect(loaded.skillRelativePaths).toEqual([
      path.join('plugins', 'demo', 'skills', 'hello-verify', 'SKILL.md'),
    ])
  })

  it('skips broken plugins with warnings (fail-open per entry)', () => {
    const repo = makeTempDir('agent-plugins-cfg-')
    const good = path.join(repo, 'good')
    writePlugin(good, { $schema: AGENT_PLUGINS_PLUGIN_SCHEMA_ID, name: 'good' }, [
      { name: 'one' },
    ])

    const result = loadConfiguredAgentPlugins(repo, ['good', 'missing-plugin'])
    expect(result.plugins).toHaveLength(1)
    expect(result.skillRelativePaths).toHaveLength(1)
    expect(result.warnings.some((w) => w.includes('missing-plugin'))).toBe(true)
  })

  it('loads the templates example plugin', () => {
    const repoRoot = path.resolve(import.meta.dirname, '../..')
    const example = path.join(repoRoot, 'templates', 'agent-plugin.example')
    const loaded = loadAgentPlugin(example, repoRoot)
    expect(loaded.manifest.name).toBe('agent-looper-example')
    expect(loaded.skillRelativePaths.some((p) => p.includes('hello-verify'))).toBe(true)
  })
})

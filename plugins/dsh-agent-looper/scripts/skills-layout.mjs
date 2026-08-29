/**
 * Shared skill layout constants and verification for the DSH companion plugin.
 * SSOT: plugins/agent-looper/skills/
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const skillsDir = path.join(pluginRoot, 'skills')
export const ssotRoot = path.join(pluginRoot, '..', 'agent-looper', 'skills')

export const SHARED_SKILLS = [
  'design-loop',
  'install-agent-looper',
  'review-gate',
  'check-running-loops',
]

export const NATIVE_SKILLS = ['run-loop-in-dsh']

export const ALL_SKILLS = [...SHARED_SKILLS, ...NATIVE_SKILLS]

export function removeSkillEntry(name) {
  const dest = path.join(skillsDir, name)
  if (!fs.existsSync(dest)) return
  const stat = fs.lstatSync(dest)
  if (stat.isSymbolicLink()) {
    fs.unlinkSync(dest)
    return
  }
  if (stat.isDirectory()) {
    fs.rmSync(dest, { recursive: true, force: true })
    return
  }
  fs.unlinkSync(dest)
}

export function copySkillFromSsot(name) {
  const src = path.join(ssotRoot, name)
  const dest = path.join(skillsDir, name)
  if (!fs.existsSync(src)) {
    throw new Error(`SSOT missing: ${src}`)
  }
  removeSkillEntry(name)
  fs.cpSync(src, dest, { recursive: true })
}

export function materializeSharedSkills() {
  fs.mkdirSync(skillsDir, { recursive: true })
  for (const name of SHARED_SKILLS) {
    copySkillFromSsot(name)
  }
  assertNativeSkills()
}

export function assertNativeSkills() {
  for (const name of NATIVE_SKILLS) {
    const dest = path.join(skillsDir, name)
    if (!fs.existsSync(dest)) {
      throw new Error(`Native DSH skill missing: ${dest}`)
    }
    if (fs.lstatSync(dest).isSymbolicLink()) {
      throw new Error(`${name} must be a real directory, not a symlink`)
    }
    const skillMd = path.join(dest, 'SKILL.md')
    if (!fs.existsSync(skillMd)) {
      throw new Error(`${name}/SKILL.md missing`)
    }
  }
}

/** @returns {string[]} symlink paths under skillsDir (relative to skillsDir) */
export function findSkillSymlinks(root = skillsDir) {
  const dangling = []
  if (!fs.existsSync(root)) return dangling

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name)
    if (entry.isSymbolicLink()) {
      dangling.push(path.relative(skillsDir, entryPath))
      continue
    }
    if (entry.isDirectory()) {
      for (const nested of walkForSymlinks(entryPath)) {
        dangling.push(path.join(entry.name, nested))
      }
    }
  }
  return dangling
}

function walkForSymlinks(dir) {
  const found = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) {
      found.push(path.relative(dir, entryPath))
      continue
    }
    if (entry.isDirectory()) {
      for (const nested of walkForSymlinks(entryPath)) {
        found.push(path.join(entry.name, nested))
      }
    }
  }
  return found
}

export function verifyMaterializedSkillsLayout() {
  const errors = []

  for (const symlink of findSkillSymlinks()) {
    errors.push(`skills/${symlink} is a symlink — run materialize-skills before pack or dsh plugin add`)
  }

  for (const name of ALL_SKILLS) {
    const entry = path.join(skillsDir, name)
    if (!fs.existsSync(entry)) {
      errors.push(`skills/${name} missing`)
      continue
    }
    if (fs.lstatSync(entry).isSymbolicLink()) {
      errors.push(`skills/${name} is a symlink`)
      continue
    }
    const skillMd = path.join(entry, 'SKILL.md')
    if (!fs.existsSync(skillMd)) {
      errors.push(`skills/${name}/SKILL.md missing`)
    }
  }

  for (const name of SHARED_SKILLS) {
    const materialized = path.join(skillsDir, name, 'SKILL.md')
    const ssot = path.join(ssotRoot, name, 'SKILL.md')
    if (!fs.existsSync(materialized) || !fs.existsSync(ssot)) continue
    const a = fs.readFileSync(materialized, 'utf8')
    const b = fs.readFileSync(ssot, 'utf8')
    if (a !== b) {
      errors.push(`skills/${name}/SKILL.md differs from agent-looper SSOT`)
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('\n'))
  }
}

#!/usr/bin/env node
/**
 * Materialize shared skills under plugins/dsh-agent-looper/skills/.
 *
 * - link (default): symlinks to plugins/agent-looper/skills/ (monorepo dev checkout).
 * - copy: real directories for npm pack (prepack); postpack restores links.
 *
 * Native DSH-only skill run-loop-in-dsh is never touched.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const skillsDir = path.join(pluginRoot, 'skills')
const ssotRoot = path.join(pluginRoot, '..', 'agent-looper', 'skills')

/** Shared with plugins/agent-looper/skills/ — one body per skill. */
const SHARED_SKILLS = [
  'design-loop',
  'install-agent-looper',
  'review-gate',
  'check-running-loops',
]

/** DSH-only; must remain a real directory, not a symlink. */
const NATIVE_SKILLS = ['run-loop-in-dsh']

const mode = process.argv[2] === 'copy' ? 'copy' : 'link'

function removeSkillEntry(name) {
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

function linkSkill(name) {
  const src = path.join(ssotRoot, name)
  const dest = path.join(skillsDir, name)
  if (!fs.existsSync(src)) {
    throw new Error(`SSOT missing: ${src}`)
  }
  removeSkillEntry(name)
  const rel = path.relative(skillsDir, src)
  fs.symlinkSync(rel, dest)
}

function copySkill(name) {
  const src = path.join(ssotRoot, name)
  const dest = path.join(skillsDir, name)
  if (!fs.existsSync(src)) {
    throw new Error(`SSOT missing: ${src}`)
  }
  removeSkillEntry(name)
  fs.cpSync(src, dest, { recursive: true })
}

function assertNativeSkills() {
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

fs.mkdirSync(skillsDir, { recursive: true })

for (const name of SHARED_SKILLS) {
  if (mode === 'copy') copySkill(name)
  else linkSkill(name)
}

assertNativeSkills()

console.log(`materialize-skills: ${mode} — ${SHARED_SKILLS.join(', ')}`)

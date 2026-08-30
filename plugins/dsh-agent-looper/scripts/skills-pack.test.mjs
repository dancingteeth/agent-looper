#!/usr/bin/env node
/**
 * Fails if packing or adding only plugins/dsh-agent-looper would ship dangling symlinks.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  SHARED_SKILLS,
  materializeSharedSkills,
  pluginRoot,
  skillsDir,
  ssotRoot,
  verifyMaterializedSkillsLayout,
} from './skills-layout.mjs'

function withSymlinkedSharedSkills(fn) {
  const backups = new Map()
  for (const name of SHARED_SKILLS) {
    const dest = path.join(skillsDir, name)
    if (fs.existsSync(dest)) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-skill-backup-'))
      fs.cpSync(dest, tmp, { recursive: true })
      backups.set(name, tmp)
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.symlinkSync(path.relative(skillsDir, path.join(ssotRoot, name)), dest)
  }
  try {
    fn()
  } finally {
    for (const name of SHARED_SKILLS) {
      const dest = path.join(skillsDir, name)
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
      const backup = backups.get(name)
      if (backup) fs.cpSync(backup, dest, { recursive: true })
    }
    for (const backup of backups.values()) {
      fs.rmSync(backup, { recursive: true, force: true })
    }
    materializeSharedSkills()
  }
}

test('verifyMaterializedSkillsLayout rejects symlinked shared skills', () => {
  withSymlinkedSharedSkills(() => {
    assert.throws(() => verifyMaterializedSkillsLayout(), /symlink/)
  })
})

test('materialize leaves real in-tree skill files matching SSOT', () => {
  materializeSharedSkills()
  assert.doesNotThrow(() => verifyMaterializedSkillsLayout())
})

test('npm pack of plugin-only dir contains no symlinks under skills/', () => {
  materializeSharedSkills()
  verifyMaterializedSkillsLayout()

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-agent-looper-pack-'))

  execFileSync('npm', ['pack', '--pack-destination', tmp], {
    cwd: pluginRoot,
    stdio: 'pipe',
  })

  const packed = fs.readdirSync(tmp).find((name) => name.endsWith('.tgz'))
  assert.ok(packed, 'npm pack should emit a tarball')

  const packDir = path.join(tmp, 'extract')
  fs.mkdirSync(packDir, { recursive: true })
  execFileSync('tar', ['-xzf', path.join(tmp, packed), '-C', packDir], { stdio: 'pipe' })

  const extracted = fs.readdirSync(packDir).find((name) => name === 'package')
  assert.ok(extracted, 'tarball should contain package/ root')
  const skillsRoot = path.join(packDir, extracted, 'skills')

  for (const entry of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    const entryPath = path.join(skillsRoot, entry.name)
    assert.equal(
      fs.lstatSync(entryPath).isSymbolicLink(),
      false,
      `packed skills/${entry.name} must not be a symlink`,
    )
    assert.ok(fs.existsSync(path.join(entryPath, 'SKILL.md')), `${entry.name}/SKILL.md in tarball`)
  }

  fs.rmSync(tmp, { recursive: true, force: true })
})

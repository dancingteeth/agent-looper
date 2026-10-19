#!/usr/bin/env node
// Copy runtime-neutral skills from the Cursor companion so the OpenCode package ships one source of truth.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.resolve(pkgRoot, '../agent-looper/skills')
const SHARED_SKILLS = ['design-loop', 'review-gate', 'check-running-loops']

if (!fs.existsSync(sourceRoot)) {
  // Installed from npm: skills/ already shipped in the tarball.
  process.exit(0)
}

for (const name of SHARED_SKILLS) {
  const dest = path.join(pkgRoot, 'skills', name)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(path.join(sourceRoot, name), dest, {
    recursive: true,
    filter: (src) => !src.endsWith('.test.mjs'),
  })
}

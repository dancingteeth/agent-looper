#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectDefaultBranch } from '../context/defaultBranch.js'
import { resolveRepoContext } from '../context/repoContext.js'
import { REPO_PROFILE_RELATIVE_PATH } from '../context/repoProfile.js'
import { parseRepoRootFlag } from './shared.js'

/** dist/cli/init.js → package root */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const templatesDir = path.join(packageRoot, 'templates')

function usage(): string {
  return `Usage: agent-loop-init [options]

Scaffolds .cursor/agent-loop.repo.json, GOAL.template.md, and example loop bundle.

Options:
  --repo-root <path>   Target repo (default: process.cwd())
  --force              Overwrite existing files`
}

function writeRepoProfile(dest: string, repoRoot: string, force: boolean): void {
  const src = path.join(templatesDir, 'agent-loop.repo.json')
  if (!fs.existsSync(src)) {
    throw new Error(`Missing package template: ${src}`)
  }
  if (fs.existsSync(dest) && !force) {
    console.error(`[agent-loop-init] skip (exists): ${dest}`)
    return
  }

  const profile = JSON.parse(fs.readFileSync(src, 'utf8')) as Record<string, unknown>
  profile.defaultBranch = detectDefaultBranch(repoRoot)

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
  console.error(`[agent-loop-init] wrote ${dest} (defaultBranch=${profile.defaultBranch})`)
}

const { remaining, repoRoot: repoRootArg } = parseRepoRootFlag(process.argv.slice(2))
const force = remaining.includes('--force')

if (remaining.includes('--help') || remaining.includes('-h')) {
  console.log(usage())
  process.exit(0)
}

const ctx = resolveRepoContext({ repoRoot: repoRootArg })
const cursorDir = path.join(ctx.repoRoot, '.cursor')
const loopsDir = path.join(cursorDir, 'loops')
const exampleDir = path.join(loopsDir, 'example-fix')

function copyTemplate(name: string, dest: string, force: boolean): void {
  const src = path.join(templatesDir, name)
  if (!fs.existsSync(src)) {
    throw new Error(`Missing package template: ${src}`)
  }
  if (fs.existsSync(dest) && !force) {
    console.error(`[agent-loop-init] skip (exists): ${dest}`)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  console.error(`[agent-loop-init] wrote ${dest}`)
}

writeRepoProfile(path.join(ctx.repoRoot, REPO_PROFILE_RELATIVE_PATH), ctx.repoRoot, force)
copyTemplate('GOAL.template.md', path.join(loopsDir, 'GOAL.template.md'), force)
copyTemplate('loop.json.example', path.join(exampleDir, 'loop.json'), force)
copyTemplate('GOAL.example.md', path.join(exampleDir, 'GOAL.md'), force)

console.error(`[agent-loop-init] done — repo=${ctx.repoRoot}`)
console.error(`[agent-loop-init] next: edit .cursor/agent-loop.repo.json and run:`)
console.error(`  agent-loop run .cursor/loops/example-fix --runtime cline-pass`)
console.error(`  # when ClinePass weekly quota is exhausted:`)
console.error(`  agent-loop run .cursor/loops/example-fix --runtime cline`)

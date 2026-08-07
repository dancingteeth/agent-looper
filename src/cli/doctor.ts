#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveRepoContext } from '../context/repoContext.js'
import {
  formatRepoProfileCheck,
  validateRepoProfile,
} from '../context/repoProfileDoctor.js'
import {
  formatPackageDistHelp,
  inspectPackageInstall,
  validatePackageDist,
} from '../packageDist.js'
import {
  checkModelPricingDrift,
  formatModelPricingDriftReport,
} from '../usage/modelPricingDrift.js'

function resolvePackageRoot(fromModuleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(fromModuleUrl)), '..', '..')
}

function usage(): string {
  return `Usage: agent-loop-doctor [options]

Validates @dancingteeth/agent-looper install integrity for file: consumers
and checks consumer repo profile / loop.json pitfalls.

Options:
  --repo-root <path>   Consumer repo (default: process.cwd())
  --install-check      Exit 1 on failure (for postinstall); quiet on success
  --json               Machine-readable report on stdout`
}

const argv = process.argv.slice(2)
let consumerRoot = process.cwd()
let installCheck = false
let json = false

for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--help' || arg === '-h') {
    console.log(usage())
    process.exit(0)
  }
  if (arg === '--install-check') {
    installCheck = true
    continue
  }
  if (arg === '--json') {
    json = true
    continue
  }
  if (arg === '--repo-root') {
    consumerRoot = argv[++i] ?? ''
    if (!consumerRoot) {
      console.error('--repo-root requires a path')
      process.exit(1)
    }
    continue
  }
  console.error(usage())
  process.exit(1)
}

const packageRoot = resolvePackageRoot(import.meta.url)
const installReport = {
  ...inspectPackageInstall({ packageRoot, consumerRoot }),
  consumerRootHint: consumerRoot,
}

const profileCheck = validateRepoProfile(resolveRepoContext({ repoRoot: consumerRoot }))
const pricingDrift = checkModelPricingDrift()
const report = {
  ...installReport,
  profile: profileCheck,
  modelPricing: pricingDrift,
  ok: installReport.ok && profileCheck.ok && pricingDrift.ok,
}

if (json) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(report.ok ? 0 : 1)
}

if (report.ok) {
  if (!installCheck) {
    console.log(`[@dancingteeth/agent-looper] OK — packageRoot=${packageRoot}`)
    if (report.fileDep) {
      console.log(`  file: ${report.fileDep.specifier} → ${report.fileDep.resolvedPath}`)
    }
    console.log(`  dist artifacts: ${validatePackageDist(packageRoot).length === 0 ? 'complete' : 'incomplete'}`)
    for (const warning of profileCheck.warnings) {
      console.log(`  warn: ${warning}`)
    }
  }
  process.exit(0)
}

if (!installReport.ok) {
  console.error(formatPackageDistHelp(installReport))
}

if (!profileCheck.ok) {
  console.error('[agent-loop-doctor] repo profile issues:')
  console.error(formatRepoProfileCheck(profileCheck))
}

for (const warning of profileCheck.warnings) {
  console.error(`[agent-loop-doctor] warn: ${warning}`)
}

if (!pricingDrift.ok) {
  console.error('[agent-loop-doctor] model pricing drift:')
  console.error(formatModelPricingDriftReport(pricingDrift.issues))
}

process.exit(1)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const manifestUrl = new URL('../scripts/dist-manifest.json', import.meta.url)

export type PackageDistIssue = {
  kind: 'missing-file' | 'missing-file-dep-path'
  path: string
  message: string
}

export type PackageDistReport = {
  packageRoot: string
  ok: boolean
  issues: PackageDistIssue[]
  fileDep?: {
    specifier: string
    resolvedPath: string
    exists: boolean
  }
}

function loadRequiredPaths(): string[] {
  const raw = fs.readFileSync(fileURLToPath(manifestUrl), 'utf8')
  const parsed = JSON.parse(raw) as { required: string[] }
  return parsed.required
}

export function validatePackageDist(packageRoot: string): PackageDistIssue[] {
  const issues: PackageDistIssue[] = []
  for (const rel of loadRequiredPaths()) {
    const full = path.join(packageRoot, rel)
    if (!fs.existsSync(full)) {
      issues.push({
        kind: 'missing-file',
        path: rel,
        message: `Missing ${rel}`,
      })
    }
  }
  return issues
}

export function findFileDependency(
  consumerRoot: string,
): { specifier: string; resolvedPath: string; exists: boolean } | undefined {
  const pkgPath = path.join(consumerRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return undefined

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  const sections = [pkg.devDependencies, pkg.dependencies]
  for (const section of sections) {
    const specifier = section?.['@dancingteeth/agent-loop']
    if (!specifier?.startsWith('file:')) continue
    const rel = specifier.slice('file:'.length)
    const resolvedPath = path.resolve(consumerRoot, rel)
    return {
      specifier,
      resolvedPath,
      exists: fs.existsSync(resolvedPath),
    }
  }

  return undefined
}

export function inspectPackageInstall(options: {
  packageRoot: string
  consumerRoot?: string
}): PackageDistReport {
  const issues = validatePackageDist(options.packageRoot)
  const fileDep = options.consumerRoot
    ? findFileDependency(options.consumerRoot)
    : undefined

  if (fileDep && !fileDep.exists) {
    issues.push({
      kind: 'missing-file-dep-path',
      path: fileDep.resolvedPath,
      message: `package.json pins ${fileDep.specifier} but path does not exist: ${fileDep.resolvedPath}`,
    })
  }

  return {
    packageRoot: options.packageRoot,
    ok: issues.length === 0,
    issues,
    fileDep,
  }
}

export type PackageDistReportWithHint = PackageDistReport & {
  consumerRootHint?: string
}

export function formatPackageDistHelp(
  report: PackageDistReportWithHint,
): string {
  const lines: string[] = ['[@dancingteeth/agent-loop] install check failed.', '']

  for (const issue of report.issues) {
    lines.push(`  • ${issue.message}`)
  }

  if (report.fileDep && !report.fileDep.exists) {
    const parent = path.dirname(report.fileDep.resolvedPath)
    const target = report.packageRoot
    lines.push('')
    lines.push('The file: dependency expects a checkout on disk. Typical fix:')
    lines.push(`  mkdir -p ${parent}`)
    lines.push(`  ln -sf ${target} ${report.fileDep.resolvedPath}`)
    lines.push(`  cd ${target} && pnpm install && pnpm build`)
    if (report.consumerRootHint) {
      lines.push(`  cd ${report.consumerRootHint} && pnpm install`)
    }
  } else if (!report.ok) {
    lines.push('')
    lines.push('Rebuild the harness checkout, then reinstall the consumer:')
    lines.push(`  cd ${report.packageRoot} && pnpm install && pnpm build`)
    lines.push('  cd <consumer-repo> && pnpm install')
  }

  lines.push('')
  lines.push('Diagnose anytime: pnpm exec agent-loop-doctor')
  return lines.join('\n')
}

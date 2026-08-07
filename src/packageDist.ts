import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const manifestUrl = new URL('../scripts/dist-manifest.json', import.meta.url)

export type PackageDistIssue = {
  kind: 'missing-file' | 'missing-file-dep-path' | 'runtime-import-failed'
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

function collectRelativeJsImports(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8')
  const imports: string[] = []
  const patterns = [
    /from ['"](\.\/[^'"]+\.js)['"]/g,
    /import\(['"](\.\/[^'"]+\.js)['"]\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const rel = match[1]
      if (rel) imports.push(rel)
    }
  }
  return imports
}

/** Walk relative .js imports from agentLoop — catches dist files missing from the manifest. */
export function validatePackageDistRuntime(packageRoot: string): PackageDistIssue[] {
  const entry = path.join(packageRoot, 'dist/loop/agentLoop.js')
  if (!fs.existsSync(entry)) {
    return [
      {
        kind: 'missing-file',
        path: 'dist/loop/agentLoop.js',
        message: 'Missing dist/loop/agentLoop.js',
      },
    ]
  }

  const issues: PackageDistIssue[] = []
  const queue = [entry]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const filePath = queue.shift()!
    const normalized = path.normalize(filePath)
    if (visited.has(normalized)) continue
    visited.add(normalized)

    for (const rel of collectRelativeJsImports(filePath)) {
      const resolved = path.normalize(path.join(path.dirname(filePath), rel))
      if (!resolved.startsWith(path.normalize(path.join(packageRoot, 'dist')))) {
        continue
      }
      if (!fs.existsSync(resolved)) {
        const relToDist = path.relative(packageRoot, resolved)
        issues.push({
          kind: 'runtime-import-failed',
          path: relToDist,
          message: `Missing ${relToDist} (imported by ${path.relative(packageRoot, filePath)})`,
        })
        continue
      }
      queue.push(resolved)
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
    const specifier = section?.['@dancingteeth/agent-looper']
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
  const staticIssues = validatePackageDist(options.packageRoot)
  const issues = [
    ...staticIssues,
    ...(staticIssues.length === 0 ? validatePackageDistRuntime(options.packageRoot) : []),
  ]
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
  const lines: string[] = ['[@dancingteeth/agent-looper] install check failed.', '']

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
    const runtimeFailed = report.issues.some((i) => i.kind === 'runtime-import-failed')
    if (runtimeFailed) {
      lines.push('')
      lines.push(
        'If the consumer still errors with ERR_MODULE_NOT_FOUND after rebuild, refresh the file: link:',
      )
      lines.push('  cd <consumer-repo> && pnpm install')
    }
  }

  lines.push('')
  lines.push('Diagnose anytime: pnpm exec agent-loop-doctor')
  return lines.join('\n')
}

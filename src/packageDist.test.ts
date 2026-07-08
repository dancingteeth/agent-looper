import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findFileDependency,
  formatPackageDistHelp,
  inspectPackageInstall,
  validatePackageDist,
  validatePackageDistRuntime,
} from './packageDist.js'

const packageRoot = path.resolve(import.meta.dirname, '..')

describe('validatePackageDist', () => {
  it('passes for a built checkout', () => {
    expect(validatePackageDist(packageRoot)).toEqual([])
  })

  it('resolves run.js import graph for a built checkout', () => {
    expect(validatePackageDistRuntime(packageRoot)).toEqual([])
  })

  it('reports missing same-dir modules in the run.js import graph', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-dist-'))
    const cliDir = path.join(dir, 'dist/cli')
    fs.mkdirSync(cliDir, { recursive: true })
    fs.writeFileSync(
      path.join(cliDir, 'run.js'),
      "import { x } from './missing-module.js'\n",
    )
    const issues = validatePackageDistRuntime(dir)
    expect(issues.some((i) => i.path.includes('missing-module.js'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports missing parent-dir modules in the run.js import graph', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-dist-'))
    const cliDir = path.join(dir, 'dist/cli')
    fs.mkdirSync(cliDir, { recursive: true })
    fs.writeFileSync(
      path.join(cliDir, 'run.js'),
      "import { x } from '../loop/missing-module.js'\n",
    )
    const issues = validatePackageDistRuntime(dir)
    expect(issues.some((i) => i.path.includes('missing-module.js'))).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports missing dist files', () => {
    const issues = validatePackageDist('/tmp/nonexistent-agent-loop')
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0]?.kind).toBe('missing-file')
  })
})

describe('findFileDependency', () => {
  it('returns undefined when package.json has no file: dep', () => {
    expect(findFileDependency(packageRoot)).toBeUndefined()
  })

  it('detects missing sibling checkout path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-consumer-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        devDependencies: {
          '@dancingteeth/agent-loop': 'file:../../agent-loop',
        },
      }),
    )
    const fileDep = findFileDependency(dir)
    expect(fileDep?.specifier).toBe('file:../../agent-loop')
    expect(fileDep?.exists).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('inspectPackageInstall', () => {
  it('formats actionable help for missing file: path', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-consumer-'))
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        devDependencies: {
          '@dancingteeth/agent-loop': 'file:../../agent-loop',
        },
      }),
    )
    const report = {
      ...inspectPackageInstall({ packageRoot, consumerRoot: dir }),
      consumerRootHint: dir,
    }
    const help = formatPackageDistHelp(report)
    expect(help).toContain('file:../../agent-loop')
    expect(help).toContain('ln -sf')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

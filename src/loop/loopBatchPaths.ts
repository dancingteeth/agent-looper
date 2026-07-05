import path from 'node:path'

export function resolveBatchDir(batchDirArg: string, repoRoot: string): string {
  const resolved = path.isAbsolute(batchDirArg) ? batchDirArg : path.join(repoRoot, batchDirArg)
  return path.resolve(resolved)
}

export function resolveBatchLoopDir(loopEntry: string, batchDir: string, repoRoot: string): string {
  if (path.isAbsolute(loopEntry)) {
    return path.resolve(loopEntry)
  }
  if (loopEntry.startsWith('.cursor/') || loopEntry.startsWith('src/')) {
    return path.resolve(repoRoot, loopEntry)
  }
  const loopsRoot = path.resolve(batchDir, '..')
  return path.resolve(loopsRoot, loopEntry)
}

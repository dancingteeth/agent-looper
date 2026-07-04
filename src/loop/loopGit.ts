import { execFileSync } from 'node:child_process'

export type GitWorkspaceSnapshot = {
  branch: string
  shortSha: string
  diffStat: string
  statusPorcelain: string
}

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim()
}

export function captureGitWorkspaceSnapshot(cwd: string): GitWorkspaceSnapshot {
  try {
    const branch = runGit(['branch', '--show-current'], cwd) || '(detached)'
    const shortSha = runGit(['rev-parse', '--short', 'HEAD'], cwd)
    const diffStat = runGit(['diff', '--stat'], cwd) || '(no unstaged diff)'
    const statusPorcelain = runGit(['status', '--porcelain'], cwd) || '(clean)'
    return { branch, shortSha, diffStat, statusPorcelain }
  } catch {
    return {
      branch: '(unknown)',
      shortSha: '(unknown)',
      diffStat: '(git unavailable)',
      statusPorcelain: '(git unavailable)',
    }
  }
}

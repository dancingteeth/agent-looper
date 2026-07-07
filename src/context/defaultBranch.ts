import { execFileSync } from 'node:child_process'

function runGit(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function branchRefExists(repoRoot: string, branch: string): boolean {
  try {
    runGit(['rev-parse', '--verify', branch], repoRoot)
    return true
  } catch {
    return false
  }
}

/** Best-effort default branch for post-loop diffs and init scaffolding. */
export function detectDefaultBranch(repoRoot: string): string {
  try {
    const symbolic = runGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoRoot)
    const match = symbolic.match(/^refs\/remotes\/origin\/(.+)$/)
    if (match?.[1] && branchRefExists(repoRoot, match[1])) {
      return match[1]
    }
  } catch {
    // no origin/HEAD
  }

  for (const candidate of ['main', 'master']) {
    if (branchRefExists(repoRoot, candidate)) {
      return candidate
    }
  }

  try {
    const current = runGit(['branch', '--show-current'], repoRoot)
    if (current) return current
  } catch {
    // not a git repo
  }

  return 'main'
}

export function defaultBranchRefExists(repoRoot: string, branch: string): boolean {
  return branchRefExists(repoRoot, branch)
}

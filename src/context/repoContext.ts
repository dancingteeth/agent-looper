import path from 'node:path'
import { loadRepoProfile, type RepoProfile } from './repoProfile.js'

export type RepoContext = {
  repoRoot: string
  profile: RepoProfile
}

export type ResolveRepoContextOptions = {
  /** Target repository root. Defaults to `process.cwd()`. */
  repoRoot?: string
}

export function resolveRepoContext(options: ResolveRepoContextOptions = {}): RepoContext {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd())
  const profile = loadRepoProfile(repoRoot)
  return { repoRoot, profile }
}

export function resolveTaskwarriorProject(
  loopProject: string | undefined,
  profile: RepoProfile,
): string {
  const project = loopProject?.trim() || profile.taskwarriorProject
  return project
}

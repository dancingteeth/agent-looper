import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { failureFingerprint } from './loopStagnation.js'
import type { VerifyResult } from './loopVerify.js'

export const STALL_PROBE_VARIANTS = ['procedure', 'facts'] as const
export type StallProbeVariant = (typeof STALL_PROBE_VARIANTS)[number]

export interface WorkspacePort<S = unknown> {
  snapshot(): S | Promise<S>
  restore(snap: S): void | Promise<void>
}

export function buildStallProbePromptSection(
  variant: StallProbeVariant,
  input: { verifyCommand: string; lastVerify: VerifyResult | null; diffStat: string },
): string {
  if (variant === 'procedure') {
    return `## Stall probe: procedure hints

1. Run the verifier exactly: \`${input.verifyCommand}\`
2. Read the **first** failure in the output — that is the target.
3. Make the **smallest** fix that addresses that failure.
4. Re-run the verifier until you understand the result (one focused edit pass).`
  }

  const failingLine = firstNonEmptyOutputLine(input.lastVerify)
  const diffBlock = input.diffStat.trim() ? input.diffStat.trim() : '(no diff stat)'
  return `## Stall probe: repo facts

- **Verifier:** \`${input.verifyCommand}\`
- **Last failing line:** ${failingLine || '(none captured)'}
- **Git diff stat:**
\`\`\`
${diffBlock}
\`\`\`

Use these facts; prefer a concrete fix over repeating the same approach.`
}

function firstNonEmptyOutputLine(lastVerify: VerifyResult | null): string {
  if (!lastVerify) return ''
  for (const line of `${lastVerify.stdout}\n${lastVerify.stderr}`.split('\n')) {
    if (line.trim()) return line
  }
  return ''
}

export function pickStallProbeWinner(
  stalled: VerifyResult,
  outcomes: Array<{ variant: StallProbeVariant; verify: VerifyResult }>,
): StallProbeVariant | undefined {
  const stalledFp = failureFingerprint(stalled)
  for (const outcome of outcomes) {
    if (outcome.verify.complete) return outcome.variant
  }
  for (const outcome of outcomes) {
    if (failureFingerprint(outcome.verify) !== stalledFp) return outcome.variant
  }
  return undefined
}

/**
 * Snapshot of the live workspace stored only as git objects — taking it never touches the
 * worktree, the index, HEAD, refs or the stash.
 *
 * - `indexTree`: the real index (`git write-tree`), so staged adds, renames, deletions and
 *   modes come back exactly.
 * - `worktreeTree`: the worktree as `git add -A` would see it, built in a throwaway index
 *   file. Respects .gitignore (ignored files are never captured, restored or deleted),
 *   stores symlinks as links (never followed), keeps the executable bit and raw bytes, and
 *   handles any path (git plumbing with -z, no porcelain quoting).
 */
export type GitWorkspaceSnap = {
  head: string
  indexTree: string
  worktreeTree: string
}

export type GitWorkspacePortOptions = {
  /**
   * Repo-relative directories whose files restore never deletes (default: `.cursor/loops`,
   * the running loop's bundle and its scratch). Snapshot content under them is still
   * written back; only removal of paths absent from the snapshot is skipped.
   */
  protectedDirs?: string[]
}

const DEFAULT_PROTECTED_DIRS = ['.cursor/loops']

function git(
  repoRoot: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 256 * 1024 * 1024,
  }).trimEnd()
}

function gitBuffer(repoRoot: string, args: string[]): Buffer {
  return execFileSync('git', args, { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 })
}

/** Tree of the worktree as `git add -A` sees it, without touching the real index. */
function worktreeTree(repoRoot: string): string {
  const realIndex = path.resolve(repoRoot, git(repoRoot, ['rev-parse', '--git-path', 'index']))
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-probe-index-'))
  const tmpIndex = path.join(tmpDir, 'index')
  try {
    if (fs.existsSync(realIndex)) fs.copyFileSync(realIndex, tmpIndex)
    const env = { GIT_INDEX_FILE: tmpIndex }
    git(repoRoot, ['add', '-A', '--', '.'], env)
    return git(repoRoot, ['write-tree'], env)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function snapshotGitWorkspace(repoRoot: string): GitWorkspaceSnap {
  const head = git(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  // Fails on unmerged entries — the caller skips probes rather than guess.
  const indexTree = git(repoRoot, ['write-tree'])
  return { head, indexTree, worktreeTree: worktreeTree(repoRoot) }
}

type TreeEntry = { mode: string; oid: string }

/** Paths that differ between two trees, with the target entry (undefined = absent in `to`). */
function changedPaths(
  repoRoot: string,
  from: string,
  to: string,
): Array<{ rel: string; target: TreeEntry | undefined }> {
  const raw = gitBuffer(repoRoot, ['diff-tree', '-r', '-z', '--no-renames', from, to]).toString('utf8')
  const parts = raw.split('\0')
  const out: Array<{ rel: string; target: TreeEntry | undefined }> = []
  for (let k = 0; k + 1 < parts.length; k += 2) {
    const meta = parts[k]!
    const rel = parts[k + 1]!
    if (!meta.startsWith(':')) continue
    // :<srcmode> <dstmode> <srcoid> <dstoid> <status>
    const [, dstMode, , dstOid, status] = meta.slice(1).split(' ')
    out.push({
      rel,
      target: status === 'D' ? undefined : { mode: dstMode!, oid: dstOid! },
    })
  }
  return out
}

function isUnder(rel: string, dirs: readonly string[]): boolean {
  return dirs.some((d) => rel === d || rel.startsWith(`${d}/`))
}

/**
 * Make sure every parent of `rel` inside the repo is a real directory (not a symlink, not
 * a file). Returns false when a parent cannot be made safe — the path is then skipped
 * rather than written through a link to somewhere outside the repo.
 */
function ensureRealParentDirs(repoRoot: string, rel: string): boolean {
  const segments = rel.split('/').slice(0, -1)
  let current = repoRoot
  for (const segment of segments) {
    current = path.join(current, segment)
    let st: fs.Stats | undefined
    try {
      st = fs.lstatSync(current)
    } catch {
      st = undefined
    }
    if (!st) {
      fs.mkdirSync(current)
      continue
    }
    if (st.isDirectory()) continue
    // A symlink or file sits where the snapshot needs a directory: drop the link/file
    // itself (never its target) — the snapshot has no entry at this path.
    fs.unlinkSync(current)
    fs.mkdirSync(current)
  }
  return true
}

function removePath(abs: string): void {
  let st: fs.Stats | undefined
  try {
    st = fs.lstatSync(abs)
  } catch {
    return
  }
  // unlink a symlink itself; recursive rm only for a real directory
  if (st.isDirectory() && !st.isSymbolicLink()) fs.rmSync(abs, { recursive: true, force: true })
  else fs.unlinkSync(abs)
}

function pruneEmptyParents(repoRoot: string, rel: string): void {
  let dir = path.dirname(rel)
  while (dir && dir !== '.') {
    const abs = path.join(repoRoot, dir)
    try {
      if (fs.readdirSync(abs).length > 0) return
      fs.rmdirSync(abs)
    } catch {
      return
    }
    dir = path.dirname(dir)
  }
}

function writeEntry(repoRoot: string, rel: string, entry: TreeEntry): void {
  const abs = path.join(repoRoot, rel)
  if (entry.mode === '160000') return // submodule commit: nothing to write
  ensureRealParentDirs(repoRoot, rel)
  removePath(abs) // never write through an existing symlink
  const data = gitBuffer(repoRoot, ['cat-file', 'blob', entry.oid])
  if (entry.mode === '120000') {
    fs.symlinkSync(data.toString('utf8'), abs)
    return
  }
  fs.writeFileSync(abs, data, { mode: entry.mode === '100755' ? 0o755 : 0o644 })
  fs.chmodSync(abs, entry.mode === '100755' ? 0o755 : 0o644)
}

function restoreGitWorkspace(
  repoRoot: string,
  snap: GitWorkspaceSnap,
  protectedDirs: readonly string[],
): void {
  // Tripwire before any write: a probe that moved HEAD.
  const headNow = git(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  if (headNow !== snap.head) {
    let probeAddedCommits = false
    try {
      git(repoRoot, ['merge-base', '--is-ancestor', snap.head, headNow])
      probeAddedCommits = true
    } catch {
      probeAddedCommits = false
    }
    if (!probeAddedCommits) {
      throw new Error(
        `createGitWorkspacePort: HEAD moved from ${snap.head} to ${headNow} (not a descendant) — refusing to restore`,
      )
    }
    // A probe committed on top of the snapshot: undo the commit(s) without touching
    // files (they stay reachable via the reflog), then restore as usual.
    console.error(
      `[agent-loop] stall probe moved HEAD ${snap.head.slice(0, 7)} → ${headNow.slice(0, 7)}; resetting HEAD (soft) before restore`,
    )
    git(repoRoot, ['reset', '--soft', snap.head])
  }

  const current = worktreeTree(repoRoot)
  const changes = changedPaths(repoRoot, current, snap.worktreeTree)
  // Deletions first so a symlink/file can give way to a directory and vice versa.
  for (const { rel, target } of changes) {
    if (target) continue
    if (isUnder(rel, protectedDirs)) continue
    removePath(path.join(repoRoot, rel))
    pruneEmptyParents(repoRoot, rel)
  }
  for (const { rel, target } of changes) {
    if (!target) continue
    writeEntry(repoRoot, rel, target)
  }
  // Index back to exactly what it was (staged adds/renames/deletions), worktree untouched.
  git(repoRoot, ['read-tree', snap.indexTree])
  try {
    git(repoRoot, ['update-index', '-q', '--refresh'])
  } catch {
    // --refresh exits non-zero when files differ from the index — expected for dirty trees
  }
}

/**
 * Default stall-probe workspace port. Snapshot is read-only (git objects); restore rewrites
 * only the paths that differ from the snapshot, never follows symlinks, never touches
 * gitignored files, never deletes under `protectedDirs`, and leaves no stash entries.
 */
export function createGitWorkspacePort(
  repoRoot: string,
  options: GitWorkspacePortOptions = {},
): WorkspacePort<GitWorkspaceSnap> {
  const protectedDirs = options.protectedDirs ?? DEFAULT_PROTECTED_DIRS
  return {
    snapshot: () => snapshotGitWorkspace(repoRoot),
    restore: (snap) => {
      restoreGitWorkspace(repoRoot, snap, protectedDirs)
    },
  }
}

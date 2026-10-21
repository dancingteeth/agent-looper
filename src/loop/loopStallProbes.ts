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
 *
 * Limits: ignored files are not part of the snapshot (restore never deletes or rewrites
 * them, judged by the snapshot's ignore rules), and the window between snapshot and
 * restore must have no other writer — restore reverts every change made in it, not only
 * the probe's (one loop per worktree; don't edit during a probe round).
 */
export type GitWorkspaceSnap = {
  head: string
  /** `refs/heads/<branch>` HEAD pointed at, or `null` for a detached HEAD. */
  headRef: string | null
  indexTree: string
  worktreeTree: string
  /** Content of `$GIT_DIR/info/exclude` (`null` when absent) — an ignore source outside the tree. */
  infoExclude: string | null
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

function symbolicHeadRef(repoRoot: string): string | null {
  try {
    return git(repoRoot, ['symbolic-ref', '-q', 'HEAD']) || null
  } catch {
    return null // detached HEAD (exit 1)
  }
}

function infoExcludePath(repoRoot: string): string {
  return path.resolve(repoRoot, git(repoRoot, ['rev-parse', '--git-path', 'info/exclude']))
}

function readInfoExclude(repoRoot: string): string | null {
  try {
    return fs.readFileSync(infoExcludePath(repoRoot), 'utf8')
  } catch {
    return null
  }
}

function snapshotGitWorkspace(repoRoot: string): GitWorkspaceSnap {
  const head = git(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  const headRef = symbolicHeadRef(repoRoot)
  // Fails on unmerged entries — the caller skips probes rather than guess.
  const indexTree = git(repoRoot, ['write-tree'])
  return {
    head,
    headRef,
    indexTree,
    worktreeTree: worktreeTree(repoRoot),
    infoExclude: readInfoExclude(repoRoot),
  }
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
function ensureRealParentDirs(
  repoRoot: string,
  rel: string,
  protectedDirs: readonly string[],
): boolean {
  const segments = rel.split('/').slice(0, -1)
  let current = repoRoot
  let currentRel = ''
  for (const segment of segments) {
    current = path.join(current, segment)
    currentRel = currentRel ? `${currentRel}/${segment}` : segment
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
    // Never remove anything under a protected dir (the running loop's bundle): skip the path.
    if (isUnder(currentRel, protectedDirs)) return false
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

/**
 * Permission bits for a restored regular file. Git only records the executable bit, so an
 * existing regular file keeps its own bits (e.g. 0600) with just the exec bits adjusted.
 */
function restoredFileMode(existing: fs.Stats | undefined, executable: boolean): number {
  if (!existing || !existing.isFile()) return executable ? 0o755 : 0o644
  const bits = existing.mode & 0o777
  if (!executable) return bits & ~0o111
  if (bits & 0o111) return bits
  // Grant exec wherever read is granted (like git checkout of a 100755 entry).
  return bits | ((bits & 0o444) >> 2)
}

function writeEntry(
  repoRoot: string,
  rel: string,
  entry: TreeEntry,
  protectedDirs: readonly string[],
): void {
  const abs = path.join(repoRoot, rel)
  if (entry.mode === '160000') return // submodule commit: nothing to write
  if (!ensureRealParentDirs(repoRoot, rel, protectedDirs)) return
  let existing: fs.Stats | undefined
  try {
    existing = fs.lstatSync(abs)
  } catch {
    existing = undefined
  }
  removePath(abs) // never write through an existing symlink
  const data = gitBuffer(repoRoot, ['cat-file', 'blob', entry.oid])
  if (entry.mode === '120000') {
    fs.symlinkSync(data.toString('utf8'), abs)
    return
  }
  const mode = restoredFileMode(existing, entry.mode === '100755')
  fs.writeFileSync(abs, data, { mode })
  fs.chmodSync(abs, mode)
}

function isIgnoreSource(rel: string): boolean {
  return rel === '.gitignore' || rel.endsWith('/.gitignore')
}

/**
 * Of `rels`, the paths ignored by the ignore rules currently on disk (`--no-index`: a path
 * a probe force-added to the index still counts as ignored).
 */
function ignoredPaths(repoRoot: string, rels: string[]): Set<string> {
  if (rels.length === 0) return new Set()
  let out = ''
  try {
    out = execFileSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
      cwd: repoRoot,
      input: `${rels.join('\0')}\0`,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    })
  } catch (err) {
    // exit 1 = none of the paths is ignored; anything else is a real failure
    const status = (err as { status?: number }).status
    if (status !== 1) throw err
    out = (err as { stdout?: string }).stdout ?? ''
  }
  return new Set(out.split('\0').filter(Boolean))
}

function restoreHead(repoRoot: string, snap: GitWorkspaceSnap): void {
  // Branch first: a probe that ran `git checkout -b x` (or detached HEAD) keeps the sha but
  // leaves the user on another branch. Point HEAD back at the snapshot's ref without
  // touching the worktree or index; the commit check below then runs against that ref.
  const refNow = symbolicHeadRef(repoRoot)
  if (refNow !== snap.headRef) {
    console.error(
      `[agent-loop] stall probe switched HEAD ${snap.headRef ?? '(detached)'} → ${refNow ?? '(detached)'}; switching back before restore`,
    )
    if (snap.headRef) {
      let refExists = true
      try {
        git(repoRoot, ['rev-parse', '--verify', '-q', `${snap.headRef}^{commit}`])
      } catch {
        refExists = false
      }
      // A probe that deleted or renamed the branch: recreate it at the snapshot commit.
      if (!refExists) git(repoRoot, ['update-ref', snap.headRef, snap.head, ''])
      git(repoRoot, ['symbolic-ref', 'HEAD', snap.headRef])
    } else {
      git(repoRoot, ['update-ref', '--no-deref', 'HEAD', snap.head])
    }
  }

  const headNow = git(repoRoot, ['rev-parse', '--verify', 'HEAD'])
  if (headNow === snap.head) return
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

function applyChanges(
  repoRoot: string,
  changes: Array<{ rel: string; target: TreeEntry | undefined }>,
  protectedDirs: readonly string[],
): void {
  const deletions = changes
    .filter((c) => !c.target && !isUnder(c.rel, protectedDirs))
    .map((c) => c.rel)
  // Never delete a path the snapshot's ignore rules ignore (e.g. .env, node_modules a probe
  // force-added or un-ignored): callers restore the ignore sources before this runs.
  const ignored = ignoredPaths(repoRoot, deletions)
  // Deletions first so a symlink/file can give way to a directory and vice versa.
  for (const rel of deletions) {
    if (ignored.has(rel)) continue
    removePath(path.join(repoRoot, rel))
    pruneEmptyParents(repoRoot, rel)
  }
  for (const { rel, target } of changes) {
    if (!target) continue
    writeEntry(repoRoot, rel, target, protectedDirs)
  }
}

function restoreGitWorkspace(
  repoRoot: string,
  snap: GitWorkspaceSnap,
  protectedDirs: readonly string[],
): void {
  // Tripwire before any write: a probe that switched branch or moved HEAD.
  restoreHead(repoRoot, snap)

  // Ignore rules first. Under the probe's rules a probe that edited or deleted a .gitignore
  // (or info/exclude) would make ignored files (.env, node_modules) look like probe-added
  // files. Put the snapshot's ignore sources back, then diff again under the snapshot's rules.
  if (snap.infoExclude !== null && readInfoExclude(repoRoot) !== snap.infoExclude) {
    const excludeFile = infoExcludePath(repoRoot)
    fs.mkdirSync(path.dirname(excludeFile), { recursive: true })
    fs.writeFileSync(excludeFile, snap.infoExclude)
  }
  const ignoreChanges = changedPaths(repoRoot, worktreeTree(repoRoot), snap.worktreeTree).filter(
    (c) => isIgnoreSource(c.rel),
  )
  // A .gitignore the probe added (absent in the snapshot) can only ignore more, so removing
  // it first is safe; one the probe edited or deleted is written back.
  applyChanges(repoRoot, ignoreChanges, protectedDirs)

  const changes = changedPaths(repoRoot, worktreeTree(repoRoot), snap.worktreeTree)
  applyChanges(repoRoot, changes, protectedDirs)
  // Index back to exactly what it was (staged adds/renames/deletions), worktree untouched.
  git(repoRoot, ['read-tree', snap.indexTree])
  try {
    git(repoRoot, ['update-index', '-q', '--refresh'])
  } catch {
    // --refresh exits non-zero when files differ from the index — expected for dirty trees
  }
}

/**
 * Default stall-probe workspace port. Snapshot is read-only (git objects); restore puts back
 * the branch and HEAD, rewrites only the paths that differ from the snapshot, never follows
 * symlinks, never deletes a path the snapshot's ignore rules ignore, never deletes under
 * `protectedDirs`, and leaves no stash entries.
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

/**
 * A failed workspace restore during a probe round, keeping the error that led to the
 * restore (the probe worker's fault) as well: `errors` holds both and `cause` points at
 * the original, so `formatErrorChain` shows the restore failure then the original error.
 */
export function wrapProbeRestoreError(
  phase: string,
  restoreError: unknown,
  originalError?: unknown,
): AggregateError {
  const restoreMessage = restoreError instanceof Error ? restoreError.message : String(restoreError)
  const errors = originalError === undefined ? [restoreError] : [restoreError, originalError]
  return new AggregateError(
    errors,
    `stall probe workspace restore failed (${phase}): ${restoreMessage}`,
    { cause: originalError ?? restoreError },
  )
}

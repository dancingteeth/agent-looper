import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { attachVerifyClass } from './verifyClass.js'
import type { VerifyResult } from './loopVerify.js'

export const FROZEN_FILES_VERIFY_COMMAND = '(frozen files)'

export const FROZEN_LOOP_BASENAMES = [
  'GOAL.md',
  'loop.json',
  'verify.sh',
  'VERIFY.skill.md',
  'RESEARCH.md',
  'PERMISSIONS.md',
  'setup.sh',
] as const

export type FrozenFileSnapshot = {
  absPath: string
  relPath: string
  hash: string
  contents: string
}

function fileHash(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex')
}

function posixRel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

function snapshotOne(absPath: string, repoRoot: string): FrozenFileSnapshot | undefined {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return undefined
  const contents = fs.readFileSync(absPath, 'utf8')
  return {
    absPath,
    relPath: posixRel(repoRoot, absPath),
    hash: fileHash(contents),
    contents,
  }
}

/** Capture frozen spec files. Extra paths (e.g. custom `research`) are included when they exist. */
export function snapshotFrozenFiles(
  loopDir: string,
  repoRoot: string,
  extraAbsPaths: string[] = [],
): FrozenFileSnapshot[] {
  const seen = new Set<string>()
  const snapshots: FrozenFileSnapshot[] = []
  const add = (absPath: string): void => {
    const resolved = path.resolve(absPath)
    if (seen.has(resolved)) return
    seen.add(resolved)
    const snap = snapshotOne(resolved, repoRoot)
    if (snap) snapshots.push(snap)
  }

  for (const name of FROZEN_LOOP_BASENAMES) {
    add(path.join(loopDir, name))
  }
  for (const extra of extraAbsPaths) {
    add(extra)
  }
  return snapshots
}

export type FrozenRestoreResult = {
  restored: string[]
}

/** Write original bytes back. Missing files are recreated; extra new files are left alone. */
export function restoreFrozenFiles(snapshots: FrozenFileSnapshot[]): FrozenRestoreResult {
  const restored: string[] = []
  for (const snap of snapshots) {
    const exists = fs.existsSync(snap.absPath)
    const current = exists && fs.statSync(snap.absPath).isFile() ? fs.readFileSync(snap.absPath, 'utf8') : null
    if (current === snap.contents) continue
    fs.mkdirSync(path.dirname(snap.absPath), { recursive: true })
    fs.writeFileSync(snap.absPath, snap.contents, 'utf8')
    restored.push(snap.relPath)
  }
  return { restored }
}

export function frozenFilesVerifyResult(restored: string[]): VerifyResult {
  const list = restored.join(', ')
  return attachVerifyClass({
    complete: false,
    command: FROZEN_FILES_VERIFY_COMMAND,
    exitCode: 1,
    stdout: '',
    stderr: `Frozen loop files were modified and restored: ${list}`,
    reason: `Worker edited frozen loop files (${list}). Restored originals; this visit does not count as verify.`,
  })
}

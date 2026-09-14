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

/** Frozen spec file as it stood when the loop started. `contents: null` = did not exist. */
export type FrozenFileSnapshot = {
  absPath: string
  relPath: string
  contents: string | null
}

function posixRel(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/')
}

function readIfFile(absPath: string): string | null {
  return fs.existsSync(absPath) && fs.statSync(absPath).isFile()
    ? fs.readFileSync(absPath, 'utf8')
    : null
}

/**
 * Capture frozen spec files. Absent files are recorded too, so a worker cannot
 * introduce a new `verify.sh` / `setup.sh` mid-loop. Extra paths (e.g. custom `research`)
 * follow the same rule.
 */
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
    snapshots.push({
      absPath: resolved,
      relPath: posixRel(repoRoot, resolved),
      contents: readIfFile(resolved),
    })
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

/** Put every frozen path back to its snapshot state: rewrite edits, recreate deletions, remove additions. */
export function restoreFrozenFiles(snapshots: FrozenFileSnapshot[]): FrozenRestoreResult {
  const restored: string[] = []
  for (const snap of snapshots) {
    const current = readIfFile(snap.absPath)
    if (current === snap.contents) continue
    if (snap.contents === null) {
      fs.rmSync(snap.absPath, { force: true })
    } else {
      fs.mkdirSync(path.dirname(snap.absPath), { recursive: true })
      fs.writeFileSync(snap.absPath, snap.contents, 'utf8')
    }
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

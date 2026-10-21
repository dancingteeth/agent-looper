import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
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

type GitWorkspaceSnap = {
  head: string
  files: Record<string, string>
}

function gitOutput(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trimEnd()
}

function parseStatusPath(line: string): string {
  const raw = line.slice(3).trim()
  if (raw.includes(' -> ')) return raw.split(' -> ').pop()!.trim()
  return raw
}

function snapshotGitWorkspace(repoRoot: string): GitWorkspaceSnap {
  const head = gitOutput(repoRoot, 'rev-parse', 'HEAD')
  const files: Record<string, string> = {}
  const porcelain = gitOutput(repoRoot, 'status', '--porcelain=v1', '-u')
  for (const line of porcelain.split('\n')) {
    if (!line.trim()) continue
    const rel = parseStatusPath(line)
    const abs = path.join(repoRoot, rel)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue
    files[rel] = fs.readFileSync(abs, 'utf8')
  }
  return { head, files }
}

function restoreGitWorkspace(repoRoot: string, snap: GitWorkspaceSnap): void {
  execFileSync('git', ['checkout', '--', '.'], { cwd: repoRoot })
  const untracked = gitOutput(repoRoot, 'ls-files', '-o', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
  for (const rel of untracked) {
    if (!Object.prototype.hasOwnProperty.call(snap.files, rel)) {
      fs.rmSync(path.join(repoRoot, rel), { force: true, recursive: true })
    }
  }
  for (const [rel, content] of Object.entries(snap.files)) {
    const abs = path.join(repoRoot, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content)
  }
  const headAfter = gitOutput(repoRoot, 'rev-parse', 'HEAD')
  if (headAfter !== snap.head) {
    throw new Error('createGitWorkspacePort: restore moved HEAD')
  }
}

export function createGitWorkspacePort(repoRoot: string): WorkspacePort<GitWorkspaceSnap> {
  return {
    snapshot: () => snapshotGitWorkspace(repoRoot),
    restore: (snap) => {
      restoreGitWorkspace(repoRoot, snap)
    },
  }
}

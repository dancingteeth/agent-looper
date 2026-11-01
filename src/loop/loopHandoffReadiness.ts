import type { GitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'
import { isEnvVerifyFailure } from './verifyClass.js'

/**
 * AgentBaton-style capable → efficient handoff readiness.
 *
 * Deterministic proxy for the paper's three recurring signs
 * (arXiv:2610.35959 §3.3 / Appendix B):
 * 1. a substantive artifact exists in the workspace,
 * 2. real execution/test feedback was observed (even a failure counts
 *    when it narrows the problem — env/toolchain failures do not),
 * 3. the remaining work looks localized (a repeat failure signature
 *    or at least one prior product failure past the first iteration).
 *
 * This is a review-gate condition, not a worker self-decision: prompting
 * the capable model to hand off does not reliably work (Kimi 0/113,
 * GLM 6/113 in the paper), so the harness evaluates readiness after
 * each turn instead.
 */

export type HandoffReadinessInput = {
  iteration: number
  git: GitWorkspaceSnapshot
  lastVerify: VerifyResult | null
  priorFailures: VerifyResult[]
  stagnationRepeatCount?: number
  minIteration?: number
}

export type HandoffReadiness = {
  ready: boolean
  reasons: string[]
}

function workspaceHasArtifact(git: GitWorkspaceSnapshot): boolean {
  if (git.diffStat === '(git unavailable)' || git.statusPorcelain === '(git unavailable)') return false
  if (git.diffStat !== '(no unstaged diff)') return true
  return git.statusPorcelain !== '(clean)'
}

function hasRealFeedback(lastVerify: VerifyResult): boolean {
  if (isEnvVerifyFailure(lastVerify)) return false
  const output = `${lastVerify.stdout ?? ''}\n${lastVerify.stderr ?? ''}`.trim()
  return output.length > 0
}

/** Localized remaining work: same check failing again, or a repeat signature. */
function looksLocalized(input: HandoffReadinessInput): boolean {
  if (!input.lastVerify || input.lastVerify.complete) return false
  if (input.priorFailures.length < 1) return false
  if (input.stagnationRepeatCount !== undefined && input.stagnationRepeatCount >= 1) return true
  // Fallback without a stagnation signal: at least two product failures on the
  // same verify command counts as narrowing to a localized repair.
  const failures = [...input.priorFailures, input.lastVerify].filter(
    (v) => !isEnvVerifyFailure(v),
  )
  if (failures.length < 2) return false
  const last = failures[failures.length - 1]!
  return failures.some(
    (v) => v !== last && v.command === last.command && v.exitCode === last.exitCode,
  )
}

export function detectHandoffReadiness(input: HandoffReadinessInput): HandoffReadiness {
  const reasons: string[] = []
  const minIteration = input.minIteration ?? 2
  if (input.iteration < minIteration) {
    return { ready: false, reasons: [`iteration ${input.iteration} < min ${minIteration}`] }
  }
  if (!input.lastVerify) {
    return { ready: false, reasons: ['no verify result yet'] }
  }
  if (input.lastVerify.complete) {
    return { ready: false, reasons: ['verify already green — no handoff needed'] }
  }
  const artifact = workspaceHasArtifact(input.git)
  const feedback = hasRealFeedback(input.lastVerify)
  const localized = looksLocalized(input)

  if (artifact) reasons.push('workspace artifact present')
  else reasons.push('no workspace artifact yet')
  if (feedback) reasons.push('real product feedback observed')
  else reasons.push('no real product feedback yet (env failure or empty output)')
  if (localized) reasons.push('remaining work looks localized')
  else reasons.push('remaining work not yet localized')

  return { ready: artifact && feedback && localized, reasons }
}

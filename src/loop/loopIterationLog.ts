import type { InnerAgentStatus } from '../agents/innerAgentStatus.js'
import { previewAssistantText } from '../agents/innerAgentStatus.js'
import type { ReviewRisk, ReviewVerdict } from '../review/reviewVerdict.js'
import type { AgentSessionRef } from '../stream/streamCollect.js'
import type { LoopUsageRecord } from '../usage/loopUsage.js'
import type { LoadedLoopBundle } from './loopConfig.js'
import { persistVerifyOutput, type SiblingRepoRef, type VerifyLogRefs } from './loopExtensions.js'
import type { captureGitWorkspaceSnapshot } from './loopGit.js'
import type { VerifyResult } from './loopVerify.js'

export type LoopIterationLog = {
  at: string
  iteration: number
  branch: string
  shortSha: string
  verify: VerifyResult
  finalVerify?: VerifyResult
  verifyLog?: VerifyLogRefs
  siblingRepos?: SiblingRepoRef[]
  assistantPreview: string
  innerAgent?: InnerAgentStatus
  review?: {
    verdict: ReviewVerdict
    risk: ReviewRisk
    blockersCount: number
    reviewCycle?: number
  }
  usage?: LoopUsageRecord
  /** Resolved model for the iteration (e.g. cline-pass/deepseek-v4-flash or escalated qwen). */
  model?: string
  /** Resolved reasoning tier for the iteration; 'default' when none was requested. */
  reasoningEffort?: string
  workerSession?: AgentSessionRef
  toolSummary?: Record<string, number>
  /** Transient SDK retries before this iteration's worker call succeeded (0 omitted). */
  sdkRetries?: number
  /** Wall-clock per phase for this iteration (ms). */
  durationsMs?: {
    worker?: number
    verify?: number
    judge?: number
  }
}

export function buildIterationLog(input: {
  iteration: number
  git: ReturnType<typeof captureGitWorkspaceSnapshot>
  verify: VerifyResult
  finalVerify?: VerifyResult
  verifyLog?: VerifyLogRefs
  siblingRepos?: SiblingRepoRef[]
  assistantText: string
  innerAgent?: InnerAgentStatus
  review?: LoopIterationLog['review']
  usage?: LoopUsageRecord
  model?: string
  reasoningEffort?: string
  workerSession?: AgentSessionRef
  toolSummary?: Record<string, number>
  sdkRetries?: number
  durationsMs?: LoopIterationLog['durationsMs']
}): LoopIterationLog {
  return {
    at: new Date().toISOString(),
    iteration: input.iteration,
    branch: input.git.branch,
    shortSha: input.git.shortSha,
    verify: input.verify,
    ...(input.finalVerify ? { finalVerify: input.finalVerify } : {}),
    ...(input.verifyLog ? { verifyLog: input.verifyLog } : {}),
    ...(input.siblingRepos ? { siblingRepos: input.siblingRepos } : {}),
    assistantPreview: previewAssistantText(input.assistantText, input.innerAgent),
    ...(input.innerAgent ? { innerAgent: input.innerAgent } : {}),
    ...(input.review ? { review: input.review } : {}),
    ...(input.usage ? { usage: input.usage } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.workerSession ? { workerSession: input.workerSession } : {}),
    ...(input.toolSummary ? { toolSummary: input.toolSummary } : {}),
    ...(input.sdkRetries ? { sdkRetries: input.sdkRetries } : {}),
    ...(input.durationsMs &&
    (input.durationsMs.worker || input.durationsMs.verify || input.durationsMs.judge)
      ? { durationsMs: input.durationsMs }
      : {}),
  }
}

/** Persist verify (+ optional finalVerify) output per verifyLogMode; returns log-ready copies. */
export function persistVerifyResultsForLog(
  loopDir: string,
  iteration: number,
  verify: VerifyResult,
  finalVerify: VerifyResult | undefined,
  verifyLogMode: LoadedLoopBundle['config']['verifyLogMode'],
): { verifyForLog: VerifyResult; verifyLog?: VerifyLogRefs; finalVerifyForLog?: VerifyResult } {
  const persisted = persistVerifyOutput(loopDir, iteration, verify, verifyLogMode)
  return {
    verifyForLog: persisted.verify,
    verifyLog: persisted.verifyLog,
    ...(finalVerify
      ? {
          finalVerifyForLog: persistVerifyOutput(
            loopDir,
            iteration,
            finalVerify,
            verifyLogMode,
            'final',
          ).verify,
        }
      : {}),
  }
}

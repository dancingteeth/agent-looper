import fs from 'node:fs'
import path from 'node:path'
import type { RepoProfile } from '../context/repoProfile.js'
import {
  resolveExistingExportPackRels,
  resolveLoopExportDir,
} from './loopExportPack.js'
import {
  formatLoopPrCommentBody,
  postLoopPrComment,
  sendNotifyWebhook,
  type NotifyWebhookPayload,
} from './loopNotifyChannels.js'
import { resolveNotifyCommand, runLoopNotifyCommand } from './loopNotifyCommand.js'

export type PostLoopCompletionChannelsInput = {
  repoRoot: string
  profile: RepoProfile
  kind: 'loop' | 'batch'
  bundleLabel: string
  complete: boolean
  exitCode: 0 | 1 | 2
  reason: string
  report?: string
  iterations?: number
  loopsRun?: number
  hitl?: string
  /** Absolute loop dir when kind=loop (for export path). */
  loopDir?: string
  /** Absolute loop dirs when kind=batch — aggregates existing export packs. */
  loopDirs?: string[]
  /** Relative path to in-loop run-report.md when present. */
  runReport?: string
  /** Loop/batch override for notifyCommand. */
  notifyCommand?: string
  /** Loop/batch override for notifyPrComment. */
  notifyPrComment?: boolean
  noNotifyCommand?: boolean
}

function resolveExportPackRel(input: PostLoopCompletionChannelsInput): string | undefined {
  if (input.kind === 'loop' && input.loopDir) {
    const exportDir = resolveLoopExportDir(
      input.repoRoot,
      path.relative(input.repoRoot, input.loopDir) || '.',
    )
    if (fs.existsSync(exportDir)) {
      return path.relative(input.repoRoot, exportDir)
    }
    return undefined
  }

  const dirs = input.loopDirs ?? []
  if (dirs.length === 0) return undefined
  const packs = resolveExistingExportPackRels(input.repoRoot, dirs)
  return packs.length > 0 ? packs.join(', ') : undefined
}

/**
 * Side channels after Telegram/HITL: notifyCommand, notifyWebhook, PR comment.
 * Non-blocking. Callers should emit AGENT_LOOP_DONE before awaiting this so local
 * wake is not held behind hung notify hooks.
 */
export async function postLoopCompletionChannels(
  input: PostLoopCompletionChannelsInput,
): Promise<{ exportPackRel?: string; prCommentId?: string }> {
  const exportPackRel = resolveExportPackRel(input)

  const notifyCommand = resolveNotifyCommand({
    profileCommand: input.profile.notifyCommand,
    loopCommand: input.notifyCommand,
    disabled: input.noNotifyCommand,
  })
  if (notifyCommand) {
    runLoopNotifyCommand({
      repoRoot: input.repoRoot,
      command: notifyCommand,
      kind: input.kind,
      bundle: input.bundleLabel,
      complete: input.complete,
      exitCode: input.exitCode,
      reason: input.reason,
      report: input.report,
      iterations: input.iterations,
      loopsRun: input.loopsRun,
      hitl: input.hitl,
      runReport: input.runReport,
      exportPack: exportPackRel,
    })
  }

  const webhookPayload: NotifyWebhookPayload = {
    v: 1,
    kind: input.kind,
    bundle: input.bundleLabel,
    complete: input.complete,
    exitCode: input.exitCode,
    reason: input.reason,
    report: input.report,
    iterations: input.iterations,
    loopsRun: input.loopsRun,
    hitl: input.hitl,
    exportPack: exportPackRel,
  }
  await sendNotifyWebhook({
    settings: input.profile.notifyWebhook,
    payload: webhookPayload,
  })

  const wantPr =
    input.notifyPrComment !== undefined
      ? input.notifyPrComment
      : input.profile.notifyPrComment
  let prCommentId: string | undefined
  if (wantPr) {
    prCommentId = postLoopPrComment({
      repoRoot: input.repoRoot,
      body: formatLoopPrCommentBody({
        kind: input.kind,
        bundle: input.bundleLabel,
        complete: input.complete,
        exitCode: input.exitCode,
        reason: input.reason,
        report: input.report,
        exportPack: exportPackRel,
        hitl: input.hitl,
      }),
    })
  }

  return { exportPackRel, prCommentId }
}
